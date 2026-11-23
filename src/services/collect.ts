import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { invoices, tenantProfiles, users } from "@/db/schema";
import { monthsBetween } from "@/lib/billing";
import { addMonths, dueDateFor, todayISO } from "@/lib/dates";
import { AppError, audit, type Q } from "./common";
import { getSettings, recordPaymentTx, syncInvoicesTx } from "./billing";

type Method = "cash" | "upi" | "bank_transfer" | "other";

/** The most recent month whose due date has already arrived (e.g. due on the 5th: on the 3rd of March it is February). */
export function lastDueMonth(today: string, dueDay: number) {
  const thisMonth = today.slice(0, 7);
  return today >= dueDateFor(thisMonth, dueDay) ? thisMonth : addMonths(thisMonth, -1);
}

async function dueRange(q: Q, tenantId: string, today: string) {
  const settings = await getSettings(q);
  const [t] = await q
    .select({ id: tenantProfiles.id, name: users.name, joiningDate: tenantProfiles.joiningDate, moveOutDate: tenantProfiles.moveOutDate, rent: tenantProfiles.monthlyRentPaise })
    .from(tenantProfiles)
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(eq(tenantProfiles.id, tenantId));
  if (!t) throw new AppError("Tenant not found", "tenantId");
  let last = lastDueMonth(today, settings.dueDayOfMonth);
  if (t.moveOutDate && t.moveOutDate.slice(0, 7) < last) last = t.moveOutDate.slice(0, 7);
  const months = monthsBetween(t.joiningDate.slice(0, 7), last).reverse(); // oldest first
  return { t, months, last };
}

/**
 * What "collect everything since check-in" would cover: every month from the check-in month to the last due month.
 * Months that don't have a bill yet are included (they will be billed first). Read-only — nothing is written.
 */
export async function previewDues(db: DB, tenantId: string, today = todayISO()) {
  const { t, months, last } = await dueRange(db, tenantId, today);
  const existing = await db.select().from(invoices).where(and(eq(invoices.tenantId, tenantId), gte(invoices.periodMonth, months[0] ?? "9999-99"), lte(invoices.periodMonth, last)));
  const byMonth = new Map(existing.map((i) => [i.periodMonth, i]));
  const rows = months.map((month) => {
    const inv = byMonth.get(month);
    return inv
      ? { month, invoiceId: inv.id, dueDate: inv.dueDate, balance: Math.max(inv.totalPaise - inv.paidPaise, 0), willBill: false }
      : { month, invoiceId: null as string | null, dueDate: null as string | null, balance: t.rent, willBill: true };
  });
  return { tenant: t, lastDueMonth: last, rows: rows.filter((r) => r.balance > 0), total: rows.reduce((a, r) => a + r.balance, 0), toBill: rows.filter((r) => r.willBill).length };
}

/**
 * One payment entry that settles dues oldest-first across all months from check-in to the last due date.
 * Missing monthly bills are generated first (idempotently). Leave `amountPaise` empty to collect everything.
 * Each month gets its own receipt, so every bill stays individually traceable.
 */
export async function collectDues(db: DB, actorId: string, p: { tenantId: string; amountPaise?: number | null; paidOn: string; method: Method; reference?: string | null; note?: string | null }, today = todayISO()) {
  return db.transaction(async (tx) => {
    const { months, last } = await dueRange(tx, p.tenantId, today);
    if (!months.length) throw new AppError("This tenant has no dues yet (their first due date hasn't arrived).", "tenantId");
    for (const m of months) await syncInvoicesTx(tx, actorId, m, p.tenantId); // creates only what's missing
    const open = (await tx.select().from(invoices).where(and(eq(invoices.tenantId, p.tenantId), gte(invoices.periodMonth, months[0]), lte(invoices.periodMonth, last))).orderBy(asc(invoices.periodMonth))).filter((i) => i.totalPaise > i.paidPaise && !i.cancelledAt);
    const total = open.reduce((a, i) => a + (i.totalPaise - i.paidPaise), 0);
    if (total <= 0) throw new AppError("Nothing is due for this tenant up to the last due date.", "tenantId");
    const amount = p.amountPaise ?? total;
    if (!Number.isInteger(amount) || amount <= 0) throw new AppError("Amount must be greater than zero", "amount");
    if (amount > total) throw new AppError("That is more than the total due. Leave the amount empty to collect everything.", "amount");
    let left = amount;
    const done: { month: string; amountPaise: number; receiptNo: string; id: string }[] = [];
    for (const inv of open) {
      if (left <= 0) break;
      const pay = Math.min(left, inv.totalPaise - inv.paidPaise);
      const r = await recordPaymentTx(tx, actorId, { invoiceId: inv.id, amountPaise: pay, paidOn: p.paidOn, method: p.method, reference: p.reference, note: [p.note, "Collected together with earlier dues"].filter(Boolean).join(" — ") });
      done.push({ month: inv.periodMonth, amountPaise: pay, receiptNo: r.receiptNo, id: r.id });
      left -= pay;
    }
    await audit(tx, actorId, "payment.collect_all", "tenant", p.tenantId, { amount, months: done.length, through: last });
    return { collected: amount, remaining: total - amount, payments: done };
  });
}
