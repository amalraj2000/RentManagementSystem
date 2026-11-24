import { and, asc, desc, eq, inArray, isNull, lte, or, gte, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { bedAssignments, invoiceItems, invoices, payments, rentSettings, tenantProfiles, users } from "@/db/schema";
import { dueDateFor, formatDate, monthEnd, monthLabel, monthStart, todayISO } from "@/lib/dates";
import { AppError, audit, recomputeInvoice, type Q } from "./common";
import { notifyAdmins, notifyTenant, tenantName } from "./notifications";
import { formatINR } from "@/lib/money";

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
 * with one rent item. Running it twice changes nothing.
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
    if (changed || !items.length) {
      await recomputeInvoice(tx, inv.id);
      touched++;
      const [fresh] = await tx.select({ total: invoices.totalPaise }).from(invoices).where(eq(invoices.id, inv.id));
      if (createdNow) {
        await notifyTenant(tx, t.id, { type: "invoice_ready", title: `Your ${monthLabel(month)} bill is ready`, body: `Total ${formatINR(fresh.total)}, due ${formatDate(inv.dueDate)}.`, href: `/portal/invoices/${inv.id}`, dedupeKey: `invoice:${inv.id}` });
      }
    }
  }
  if (created || touched) await audit(tx, actorId, "invoice.generate", "invoice", null, { month, created, touched });
  return { created, updated: touched - created > 0 ? touched - created : 0, total: tenants.length };
}

/** Adds an extra charge (positive) or a discount/adjustment (negative) with a mandatory description/reason. */
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
    // A discount may not push the total below what was already paid.
    if (inv.totalPaise + signed < inv.paidPaise) throw new AppError("Discount would make the total less than what is already paid", "amount");
    await tx.insert(invoiceItems).values({ invoiceId, kind, description: description.trim(), amountPaise: signed });
    await recomputeInvoice(tx, invoiceId);
    await audit(tx, actorId, `invoice.${kind}`, "invoice", invoiceId, { description, amountPaise: signed });
  });
}

function receiptNo(date: string) {
  return `R${date.replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

type PaymentInput = { invoiceId: string; amountPaise: number; paidOn: string; method: "cash" | "upi" | "bank_transfer" | "other"; reference?: string | null; note?: string | null };

export async function recordPayment(db: DB, actorId: string, p: PaymentInput) {
  return db.transaction(async (tx) => recordPaymentTx(tx, actorId, p));
}

export async function recordPaymentTx(tx: Q, actorId: string, p: PaymentInput) {
  if (!Number.isInteger(p.amountPaise) || p.amountPaise <= 0) throw new AppError("Amount must be greater than zero", "amount");
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, p.invoiceId));
  if (!inv) throw new AppError("Invoice not found");
  const balance = Math.max(inv.totalPaise - inv.paidPaise, 0);
  if (balance <= 0) throw new AppError("This bill is already fully paid", "amount");
  if (p.amountPaise > balance) throw new AppError(`Payment exceeds the outstanding balance (${formatINR(balance)})`, "amount");
  const [row] = await tx
    .insert(payments)
    .values({
      invoiceId: inv.id,
      tenantId: inv.tenantId,
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
  await audit(tx, actorId, "payment.record", "payment", row.id, { invoiceId: inv.id, amount: p.amountPaise, method: p.method });
  const who = await tenantName(tx, inv.tenantId);
  await notifyTenant(tx, inv.tenantId, { type: "payment_received", title: "Payment received", body: `${formatINR(p.amountPaise)} received on ${formatDate(p.paidOn)} (${p.method.replace("_", " ")}). Receipt ${row.receiptNo}.`, href: `/receipt/${row.id}`, dedupeKey: `pay:${row.id}` });
  await notifyAdmins(tx, { type: "payment_recorded", title: `Payment recorded: ${who}`, body: `${formatINR(p.amountPaise)} on ${formatDate(p.paidOn)} · receipt ${row.receiptNo}.`, href: `/admin/invoices/${inv.id}`, dedupeKey: `pay:${row.id}` }, actorId);
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

/** Bills that still have something unpaid. For the "record payment" screen. */
export async function openBills(db: DB) {
  const rows = await db
    .select({ id: invoices.id, name: users.name, month: invoices.periodMonth, balance: sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}` })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(isNull(invoices.cancelledAt))
    .orderBy(asc(users.name), asc(invoices.periodMonth));
  return rows.filter((r) => Number(r.balance) > 0).map((r) => ({ id: r.id, name: r.name, month: r.month, balance: Number(r.balance) }));
}

/** Admin shortcut: "this has been paid" — records the FULL remaining balance of a bill as paid today. */
export async function markPaid(db: DB, actorId: string, p: { invoiceId: string; method: "cash" | "upi"; today?: string }) {
  const today = p.today ?? todayISO();
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, p.invoiceId));
    if (!inv || inv.cancelledAt) throw new AppError("Bill not found");
    const balance = inv.totalPaise - inv.paidPaise;
    if (balance <= 0) throw new AppError("This bill is already paid");
    return recordPaymentTx(tx, actorId, { invoiceId: inv.id, amountPaise: balance, paidOn: today, method: p.method, note: "Marked as paid by the owner" });
  });
}
