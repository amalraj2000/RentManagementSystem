import { and, asc, desc, eq, inArray, isNull, lte, or, gte, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { bedAssignments, expenseAllocations, expenses, invoiceItems, invoices, payments, rentSettings, tenantProfiles, users, utilityAllocations, utilityBills } from "@/db/schema";
import { dueDateFor, formatDate, monthEnd, monthLabel, monthStart, todayISO } from "@/lib/dates";
import { AppError, audit, recomputeInvoice, type Q } from "./common";
import { purposeLabel, splitRentExpense, type Purpose } from "@/lib/billing";
import { notifyAdmins, notifyTenant, tenantName } from "./notifications";
import { formatINR } from "@/lib/money";
import { expenseLine } from "@/lib/categories";
import { expenseLinesFor } from "./expense-lines";

export async function getSettings(q: Q) {
  const [s] = await q.select().from(rentSettings).where(eq(rentSettings.id, 1));
  if (!s) throw new AppError("Settings not initialised — run the setup script");
  return s;
}

/** Tenants billable for a month: joined on/before month end and not vacated before month start. */
export async function eligibleTenants(q: Q, month: string) {
  return q
    .select({ id: tenantProfiles.id, name: users.name, rent: tenantProfiles.monthlyRentPaise })
    .from(tenantProfiles)
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(
      and(
        lte(tenantProfiles.joiningDate, monthEnd(month)),
        or(isNull(tenantProfiles.moveOutDate), gte(tenantProfiles.moveOutDate, monthStart(month))),
      ),
    )
    .orderBy(asc(users.name));
}

/** Eligible tenants who held a bed at any point in the month. */
export async function bedHoldersForMonth(q: Q, month: string, tenantIds: string[]) {
  if (!tenantIds.length) return [];
  const rows = await q
    .select({ tenantId: bedAssignments.tenantId })
    .from(bedAssignments)
    .where(
      and(
        inArray(bedAssignments.tenantId, tenantIds),
        lte(bedAssignments.startDate, monthEnd(month)),
        or(isNull(bedAssignments.endDate), gte(bedAssignments.endDate, monthStart(month))),
      ),
    );
  return [...new Set(rows.map((r) => r.tenantId))];
}

/**
 * Idempotent: ensures every eligible tenant has exactly one invoice for the month,
 * with one rent item and one item per saved utility allocation. Running it twice changes nothing.
 * Balances from earlier months stay on their own invoices (never copied), so nothing is double charged.
 */
export async function syncInvoices(db: DB, actorId: string | null, month: string, tenantId?: string) {
  return db.transaction(async (tx) => syncInvoicesTx(tx, actorId, month, tenantId));
}

export async function syncInvoicesTx(tx: Q, actorId: string | null, month: string, onlyTenant?: string) {
  const settings = await getSettings(tx);
  let tenants = await eligibleTenants(tx, month);
  if (onlyTenant) tenants = tenants.filter((t) => t.id === onlyTenant);
  const dueDate = dueDateFor(month, settings.dueDayOfMonth);
  let created = 0;
  let touched = 0;
  for (const t of tenants) {
    let [inv] = await tx.select().from(invoices).where(and(eq(invoices.tenantId, t.id), eq(invoices.periodMonth, month)));
    let createdNow = false;
    const added: { key: string; label: string; amount: number }[] = [];
    if (!inv) {
      [inv] = await tx.insert(invoices).values({ tenantId: t.id, periodMonth: month, dueDate }).onConflictDoNothing().returning();
      if (!inv) [inv] = await tx.select().from(invoices).where(and(eq(invoices.tenantId, t.id), eq(invoices.periodMonth, month)));
      else {
        created++;
        createdNow = true;
      }
    }
    let changed = false;
    const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
    if (!items.some((i) => i.kind === "rent")) {
      await tx.insert(invoiceItems).values({ invoiceId: inv.id, kind: "rent", description: `Rent – ${monthLabel(month)}`, amountPaise: t.rent });
      changed = true;
    }
    const allocs = await tx
      .select({ billId: utilityBills.id, type: utilityBills.type, amount: utilityAllocations.amountPaise })
      .from(utilityAllocations)
      .innerJoin(utilityBills, eq(utilityBills.id, utilityAllocations.utilityBillId))
      .where(and(eq(utilityAllocations.tenantId, t.id), eq(utilityBills.periodMonth, month)));
    for (const a of allocs) {
      if (items.some((i) => i.utilityBillId === a.billId)) continue;
      await tx.insert(invoiceItems).values({
        invoiceId: inv.id,
        kind: a.type,
        description: `${a.type === "electricity" ? "Electricity" : "Water"} – ${monthLabel(month)}`,
        amountPaise: a.amount,
        utilityBillId: a.billId,
      });
      added.push({ key: a.billId, label: `${a.type === "electricity" ? "Electricity" : "Water"} – ${monthLabel(month)}`, amount: a.amount });
      changed = true;
    }
    const shared = await tx
      .select({ expenseId: expenses.id, category: expenses.category, description: expenses.description, amount: expenseAllocations.amountPaise })
      .from(expenseAllocations)
      .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
      .where(and(eq(expenseAllocations.tenantId, t.id), sql`substr(${expenses.spentOn}, 1, 7) = ${month}`));
    for (const a of shared) {
      if (items.some((i) => i.expenseId === a.expenseId)) continue;
      await tx.insert(invoiceItems).values({
        invoiceId: inv.id,
        kind: "other",
        description: expenseLine(a.category, a.description),
        amountPaise: a.amount,
        expenseId: a.expenseId,
      });
      added.push({ key: a.expenseId, label: expenseLine(a.category, a.description), amount: a.amount });
      changed = true;
    }
    if (changed || !items.length) {
      await recomputeInvoice(tx, inv.id);
      touched++;
      const [fresh] = await tx.select({ total: invoices.totalPaise }).from(invoices).where(eq(invoices.id, inv.id));
      if (createdNow) {
        await notifyTenant(tx, t.id, { type: "invoice_ready", title: `Your ${monthLabel(month)} bill is ready`, body: `Total ${formatINR(fresh.total)}, due ${formatDate(inv.dueDate)}.`, href: `/portal/invoices/${inv.id}`, dedupeKey: `invoice:${inv.id}` });
      } else {
        for (const a of added) {
          await notifyTenant(tx, t.id, { type: "charge_added", title: "New charge on your bill", body: `${a.label} · ${formatINR(a.amount)} added to your ${monthLabel(month)} bill.`, href: `/portal/invoices/${inv.id}`, dedupeKey: `charge:${inv.id}:${a.key}` });
        }
      }
    }
  }
  if (created || touched) await audit(tx, actorId, "invoice.generate", "invoice", null, { month, created, touched });
  return { created, updated: touched - created > 0 ? touched - created : 0, total: tenants.length };
}

/** Adds an extra charge (positive) or a discount/adjustment (negative) with a mandatory description/reason. */
/** Rent / expense totals and paid amounts of one bill (what the tenant and admin screens show side by side). */
export async function invoiceBuckets(q: Q, invoiceId: string, extra = { rent: 0, other: 0, adjustment: 0 }, pending = { rent: 0, expense: 0 }) {
  const [inv] = await q.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new AppError("Invoice not found");
  const [s] = await q
    .select({
      rent: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'rent' then ${invoiceItems.amountPaise} else 0 end), 0)`,
      other: sql<number>`coalesce(sum(case when ${invoiceItems.kind} not in ('rent', 'adjustment') then ${invoiceItems.amountPaise} else 0 end), 0)`,
      adjustment: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'adjustment' then ${invoiceItems.amountPaise} else 0 end), 0)`,
    })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId));
  const parts = { rent: Number(s.rent) + extra.rent, other: Number(s.other) + extra.other, adjustment: Number(s.adjustment) + extra.adjustment };
  return { inv, ...splitRentExpense(parts, { rent: inv.rentPaidPaise, expense: inv.expensePaidPaise }, pending) };
}

export async function addInvoiceItem(
  db: DB,
  actorId: string,
  invoiceId: string,
  kind: "other" | "adjustment",
  description: string,
  amountPaise: number,
) {
  if (!description.trim()) throw new AppError("A reason is required", "description");
  if (!Number.isInteger(amountPaise) || amountPaise === 0) throw new AppError("Amount must be non-zero", "amount");
  if (kind === "other" && amountPaise < 0) throw new AppError("Other charges must be positive; use a discount instead", "amount");
  const signed = kind === "adjustment" ? -Math.abs(amountPaise) : amountPaise;
  await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv) throw new AppError("Invoice not found");
    // A discount may not push rent or expenses below what was already paid toward them.
    const after = await invoiceBuckets(tx, invoiceId, { rent: 0, other: kind === "other" ? signed : 0, adjustment: kind === "adjustment" ? signed : 0 });
    if (after.rentPayable < inv.rentPaidPaise || after.expensePayable < inv.expensePaidPaise) throw new AppError("Discount would make the total less than what is already paid", "amount");
    await tx.insert(invoiceItems).values({ invoiceId, kind, description: description.trim(), amountPaise: signed });
    await recomputeInvoice(tx, invoiceId);
    await audit(tx, actorId, `invoice.${kind}`, "invoice", invoiceId, { description, amountPaise: signed });
  });
}

function receiptNo(date: string) {
  return `R${date.replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

type PaymentInput = { invoiceId: string; /** Pays just this one expense line (purpose "expense"). */ invoiceItemId?: string | null; /** Rent and expenses are paid separately. Defaults to rent. */ purpose?: Purpose; amountPaise: number; paidOn: string; method: "cash" | "upi" | "bank_transfer" | "other"; reference?: string | null; note?: string | null };

export async function recordPayment(db: DB, actorId: string, p: PaymentInput) {
  return db.transaction(async (tx) => recordPaymentTx(tx, actorId, p));
}

export async function recordPaymentTx(tx: Q, actorId: string, p: PaymentInput) {
  if (!Number.isInteger(p.amountPaise) || p.amountPaise <= 0) throw new AppError("Amount must be greater than zero", "amount");
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, p.invoiceId));
  if (!inv) throw new AppError("Invoice not found");
  const purpose: Purpose = p.purpose ?? "rent";
  const label = purposeLabel(purpose).toLowerCase();
  const b = await invoiceBuckets(tx, inv.id);
  const balance = purpose === "rent" ? b.rentBalance : b.expenseBalance;
  if (balance <= 0) throw new AppError(`The ${label} on this bill is already fully paid`, "amount");
  if (p.amountPaise > balance) throw new AppError(`Payment exceeds the outstanding ${label} balance (${formatINR(balance)})`, "amount");
  let itemId: string | null = null;
  if (purpose === "expense" && p.invoiceItemId) {
    // Paying ONE expense: it can only cover that expense, never another.
    const line = (await expenseLinesFor(tx, [inv.id])).get(inv.id)?.get(p.invoiceItemId);
    if (!line) throw new AppError("That expense is not on this bill", "amount");
    if (line.balance <= 0) throw new AppError("That expense is already fully paid", "amount");
    if (p.amountPaise > line.balance) throw new AppError(`This expense has only ${formatINR(line.balance)} left to pay`, "amount");
    itemId = p.invoiceItemId;
  }
  const [row] = await tx
    .insert(payments)
    .values({
      invoiceId: inv.id,
      tenantId: inv.tenantId,
      purpose,
      invoiceItemId: itemId,
      amountPaise: p.amountPaise,
      paidOn: p.paidOn,
      method: p.method,
      reference: p.reference || null,
      note: p.note || null,
      receiptNo: receiptNo(p.paidOn),
      recordedBy: actorId,
    })
    .returning({ id: payments.id, receiptNo: payments.receiptNo });
  await recomputeInvoice(tx, inv.id);
  await audit(tx, actorId, "payment.record", "payment", row.id, { invoiceId: inv.id, amount: p.amountPaise, method: p.method, purpose });
  const who = await tenantName(tx, inv.tenantId);
  await notifyTenant(tx, inv.tenantId, { type: "payment_received", title: `${purposeLabel(purpose)} payment received`, body: `${formatINR(p.amountPaise)} received on ${formatDate(p.paidOn)} (${p.method.replace("_", " ")}). Receipt ${row.receiptNo}.`, href: `/receipt/${row.id}`, dedupeKey: `pay:${row.id}` });
  await notifyAdmins(tx, { type: "payment_recorded", title: `Payment recorded: ${who}`, body: `${purposeLabel(purpose)} · ${formatINR(p.amountPaise)} on ${formatDate(p.paidOn)} · receipt ${row.receiptNo}.`, href: `/admin/invoices/${inv.id}`, dedupeKey: `pay:${row.id}` }, actorId);
  return row;
}

/** Payments are never deleted; voiding keeps the row for audit and removes it from collected totals. */
export async function voidPayment(db: DB, actorId: string, paymentId: string, reason: string) {
  if (!reason.trim()) throw new AppError("A reason is required");
  await db.transaction(async (tx) => {
    const [pay] = await tx.select().from(payments).where(eq(payments.id, paymentId));
    if (!pay) throw new AppError("Payment not found");
    if (pay.voidedAt) throw new AppError("Payment already voided");
    await tx.update(payments).set({ voidedAt: new Date(), voidReason: reason.trim() }).where(eq(payments.id, paymentId));
    await recomputeInvoice(tx, pay.invoiceId);
    await audit(tx, actorId, "payment.void", "payment", paymentId, { reason });
    const who = await tenantName(tx, pay.tenantId);
    await notifyTenant(tx, pay.tenantId, { type: "payment_voided", title: "A payment was reversed", body: `${formatINR(pay.amountPaise)} dated ${formatDate(pay.paidOn)} was cancelled. Reason: ${reason.trim()}`, href: `/portal/invoices/${pay.invoiceId}`, dedupeKey: `void:${paymentId}` });
    await notifyAdmins(tx, { type: "payment_voided", title: `Payment voided: ${who}`, body: `${formatINR(pay.amountPaise)} · ${reason.trim()}`, href: `/admin/invoices/${pay.invoiceId}`, dedupeKey: `void:${paymentId}` }, actorId);
  });
}

export async function getInvoiceDetail(q: Q, invoiceId: string, onlyTenantId?: string) {
  const conds = [eq(invoices.id, invoiceId)];
  if (onlyTenantId) conds.push(eq(invoices.tenantId, onlyTenantId));
  const [inv] = await q
    .select({
      id: invoices.id,
      tenantId: invoices.tenantId,
      tenantName: users.name,
      periodMonth: invoices.periodMonth,
      dueDate: invoices.dueDate,
      totalPaise: invoices.totalPaise,
      paidPaise: invoices.paidPaise,
      cancelledAt: invoices.cancelledAt,
    })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(and(...conds));
  if (!inv) return null;
  const [items, pays] = await Promise.all([
    q.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).orderBy(asc(invoiceItems.createdAt)),
    q.select().from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(desc(payments.paidOn)),
  ]);
  return { ...inv, items, payments: pays };
}

export const sumOutstanding = sql<number>`coalesce(sum(max(${invoices.totalPaise} - ${invoices.paidPaise}, 0)), 0)`;

/** Amount can't change (it would break the receipt trail) — void and re-enter instead. */
export async function updatePaymentDetails(
  db: DB,
  actorId: string,
  id: string,
  p: { paidOn: string; method: "cash" | "upi" | "bank_transfer" | "other"; reference?: string | null; note?: string | null },
) {
  const [cur] = await db.select().from(payments).where(eq(payments.id, id));
  if (!cur) throw new AppError("Payment not found");
  if (cur.voidedAt) throw new AppError("Voided payments can't be edited");
  await db.update(payments).set({ paidOn: p.paidOn, method: p.method, reference: p.reference || null, note: p.note || null }).where(eq(payments.id, id));
  await audit(db, actorId, "payment.update", "payment", id, { paidOn: p.paidOn, method: p.method });
}

/** Only invoices with no payment history can be deleted (it can be regenerated afterwards). */
export async function deleteInvoice(db: DB, actorId: string, id: string) {
  await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, id));
    if (!inv) throw new AppError("Invoice not found");
    const [pay] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.invoiceId, id)).limit(1);
    if (pay) throw new AppError("This invoice has payments, so it can't be deleted. Void the payments first or leave it for the record.");
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    await tx.delete(invoices).where(eq(invoices.id, id));
    await audit(tx, actorId, "invoice.delete", "invoice", id, { month: inv.periodMonth, tenantId: inv.tenantId });
  });
}

/** Bills that still have something unpaid — with the RENT and EXPENSES balances kept apart. For the "record payment" screen. */
export async function openBills(db: DB) {
  const rows = await db
    .select({
      id: invoices.id,
      name: users.name,
      month: invoices.periodMonth,
      rentPaid: invoices.rentPaidPaise,
      expensePaid: invoices.expensePaidPaise,
      rent: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'rent' then ${invoiceItems.amountPaise} else 0 end), 0)`,
      other: sql<number>`coalesce(sum(case when ${invoiceItems.kind} not in ('rent', 'adjustment') then ${invoiceItems.amountPaise} else 0 end), 0)`,
      adjustment: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'adjustment' then ${invoiceItems.amountPaise} else 0 end), 0)`,
    })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .leftJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
    .where(isNull(invoices.cancelledAt))
    .groupBy(invoices.id)
    .orderBy(asc(users.name), asc(invoices.periodMonth));
  return rows
    .map((r) => {
      const s = splitRentExpense({ rent: Number(r.rent), other: Number(r.other), adjustment: Number(r.adjustment) }, { rent: r.rentPaid, expense: r.expensePaid });
      return { id: r.id, name: r.name, month: r.month, rentBalance: s.rentBalance, expenseBalance: s.expenseBalance };
    })
    .filter((r) => r.rentBalance > 0 || r.expenseBalance > 0);
}


/**
 * Admin shortcut: "this has been paid" — records the FULL remaining amount of ONE thing as paid today:
 * the month's rent (`itemId` empty) or ONE expense line (`itemId` given). Nothing else on the bill is touched.
 */
export async function markPaid(db: DB, actorId: string, p: { invoiceId: string; itemId?: string | null; method: "cash" | "upi"; today?: string }) {
  const today = p.today ?? todayISO();
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, p.invoiceId));
    if (!inv || inv.cancelledAt) throw new AppError("Bill not found");
    if (p.itemId) {
      const line = (await expenseLinesFor(tx, [inv.id])).get(inv.id)?.get(p.itemId);
      if (!line) throw new AppError("That expense is not on this bill");
      if (line.balance <= 0) throw new AppError("That expense is already paid");
      return recordPaymentTx(tx, actorId, { invoiceId: inv.id, purpose: "expense", invoiceItemId: p.itemId, amountPaise: line.balance, paidOn: today, method: p.method, note: "Marked as paid by the owner" });
    }
    const b = await invoiceBuckets(tx, inv.id);
    if (b.rentBalance <= 0) throw new AppError("The rent is already paid");
    return recordPaymentTx(tx, actorId, { invoiceId: inv.id, purpose: "rent", amountPaise: b.rentBalance, paidOn: today, method: p.method, note: "Marked as paid by the owner" });
  });
}
