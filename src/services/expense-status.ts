import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { expenseAllocations, invoiceItems, invoices, tenantProfiles, users, utilityAllocations } from "@/db/schema";
import { expenseLinesFor } from "./expense-lines";

export type TenantShare = {
  tenantId: string;
  name: string;
  /** What this tenant has to pay for this expense, and how much of it they have paid. */
  amount: number;
  paid: number;
  balance: number;
  /** A payment the tenant reported that the owner has not confirmed yet. */
  waiting: number;
  state: "paid" | "partial" | "unpaid" | "not_billed";
  month: string | null;
  invoiceId: string | null;
};

/**
 * "Active" while any tenant still owes their share; "completed" (inactive) once EVERY tenant has paid.
 * `none` = the expense is not shared with tenants, so there is nothing to collect.
 */
export type ExpenseStatus = { state: "none" | "active" | "completed"; paidCount: number; total: number; rows: TenantShare[] };

/**
 * For each expense: which tenants share it and who has paid / not paid. Works for shared expenses and for utility bills
 * (electricity / water), whose shares are stored separately.
 */
export async function expenseStatuses(db: DB, list: { id: string; utilityBillId: string | null }[]) {
  const out = new Map<string, ExpenseStatus>();
  if (!list.length) return out;
  const ids = list.map((e) => e.id);
  const billIds = list.flatMap((e) => (e.utilityBillId ? [e.utilityBillId] : []));
  const [shared, utility, items] = await Promise.all([
    db.select({ expenseId: expenseAllocations.expenseId, tenantId: expenseAllocations.tenantId, amount: expenseAllocations.amountPaise }).from(expenseAllocations).where(inArray(expenseAllocations.expenseId, ids)),
    billIds.length ? db.select({ billId: utilityAllocations.utilityBillId, tenantId: utilityAllocations.tenantId, amount: utilityAllocations.amountPaise }).from(utilityAllocations).where(inArray(utilityAllocations.utilityBillId, billIds)) : Promise.resolve([]),
    db
      .select({ itemId: invoiceItems.id, expenseId: invoiceItems.expenseId, billId: invoiceItems.utilityBillId, invoiceId: invoices.id, tenantId: invoices.tenantId, month: invoices.periodMonth, amount: invoiceItems.amountPaise })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoices.id, invoiceItems.invoiceId))
      .where(and(or(inArray(invoiceItems.expenseId, ids), billIds.length ? inArray(invoiceItems.utilityBillId, billIds) : sql`0`))),
  ]);
  const tenantIds = [...new Set([...shared.map((s) => s.tenantId), ...utility.map((s) => s.tenantId)])];
  const names = new Map(
    tenantIds.length
      ? (await db.select({ id: tenantProfiles.id, name: users.name }).from(tenantProfiles).innerJoin(users, eq(users.id, tenantProfiles.userId)).where(inArray(tenantProfiles.id, tenantIds))).map((t) => [t.id, t.name])
      : [],
  );
  const lines = await expenseLinesFor(db, [...new Set(items.map((i) => i.invoiceId))]);
  for (const e of list) {
    const shares = e.utilityBillId ? utility.filter((u) => u.billId === e.utilityBillId).map((u) => ({ tenantId: u.tenantId, amount: u.amount })) : shared.filter((s) => s.expenseId === e.id).map((s) => ({ tenantId: s.tenantId, amount: s.amount }));
    const rows: TenantShare[] = shares.map((s) => {
      const it = items.find((i) => i.tenantId === s.tenantId && (e.utilityBillId ? i.billId === e.utilityBillId : i.expenseId === e.id));
      const l = it ? lines.get(it.invoiceId)?.get(it.itemId) : undefined;
      if (!it || !l) return { tenantId: s.tenantId, name: names.get(s.tenantId) ?? "Tenant", amount: s.amount, paid: 0, balance: s.amount, waiting: 0, state: "not_billed", month: null, invoiceId: null };
      return { tenantId: s.tenantId, name: names.get(s.tenantId) ?? "Tenant", amount: l.payable, paid: l.covered, balance: l.balance, waiting: l.pending, state: l.balance <= 0 ? "paid" : l.covered > 0 ? "partial" : "unpaid", month: it.month, invoiceId: it.invoiceId };
    });
    rows.sort((a, b) => Number(a.state === "paid") - Number(b.state === "paid") || a.name.localeCompare(b.name)); // unpaid first
    const paidCount = rows.filter((r) => r.state === "paid").length;
    out.set(e.id, { state: rows.length === 0 ? "none" : paidCount === rows.length ? "completed" : "active", paidCount, total: rows.length, rows });
  }
  return out;
}
