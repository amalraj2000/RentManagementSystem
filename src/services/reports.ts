import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { bedAssignments, invoices, payments, rooms, tenantProfiles, users } from "@/db/schema";
import { addMonths, currentMonth, monthEnd, monthStart } from "@/lib/dates";
import { monthsBetween } from "@/lib/billing";

const outstandingExpr = sql<number>`coalesce(sum(max(${invoices.totalPaise} - ${invoices.paidPaise}, 0)), 0)`;

/** Every (non-cancelled) bill, optionally filtered, with what is still unpaid on it. */
export async function invoiceBalances(db: DB, cond?: SQL) {
  const rows = await db
    .select({
      id: invoices.id, tenantId: invoices.tenantId, userId: users.id, name: users.name, status: tenantProfiles.status, periodMonth: invoices.periodMonth, dueDate: invoices.dueDate,
      totalPaise: invoices.totalPaise, paidPaise: invoices.paidPaise,
    })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(and(isNull(invoices.cancelledAt), cond));
  return rows.map((r) => ({ ...r, balance: Math.max(r.totalPaise - r.paidPaise, 0) }));
}

export async function dashboardData(db: DB, month: string, today: string) {
  const [cap, residents, occupied, collected, pendingMonth, outstandingAll, recent, upcoming, owing] = await Promise.all([
    db.select({ n: sql<number>`coalesce(sum(${rooms.maxOccupancy}), 0)` }).from(rooms).where(isNull(rooms.archivedAt)),
    db.select({ n: sql<number>`count(*)` }).from(tenantProfiles).where(ne(tenantProfiles.status, "moved_out")),
    db.select({ n: sql<number>`count(*)` }).from(bedAssignments).where(isNull(bedAssignments.endDate)),
    db
      .select({ n: sql<number>`coalesce(sum(${payments.amountPaise}), 0)` })
      .from(payments)
      .where(and(isNull(payments.voidedAt), gte(payments.paidOn, monthStart(month)), lte(payments.paidOn, monthEnd(month)))),
    db.select({ n: outstandingExpr }).from(invoices).where(eq(invoices.periodMonth, month)),
    db.select({ n: outstandingExpr }).from(invoices),
    db
      .select({ id: payments.id, amount: payments.amountPaise, paidOn: payments.paidOn, method: payments.method, name: users.name })
      .from(payments)
      .innerJoin(tenantProfiles, eq(tenantProfiles.id, payments.tenantId))
      .innerJoin(users, eq(users.id, tenantProfiles.userId))
      .where(isNull(payments.voidedAt))
      .orderBy(desc(payments.paidOn), desc(payments.createdAt))
      .limit(5),
    invoiceBalances(db, gte(invoices.dueDate, today)).then((all) => all.filter((i) => i.balance > 0).sort((x, y) => x.dueDate.localeCompare(y.dueDate)).slice(0, 5).map((i) => ({ id: i.id, dueDate: i.dueDate, name: i.name, balance: i.balance }))),
    outstandingByTenant(db),
  ]);
  const capacity = Number(cap[0].n);
  return {
    capacity,
    residents: Number(residents[0].n),
    availableBeds: capacity - Number(occupied[0].n),
    rentCollected: Number(collected[0].n),
    pendingThisMonth: Number(pendingMonth[0].n),
    outstandingTotal: Number(outstandingAll[0].n),
    month: await monthBilling(db, month),
    recent,
    upcoming,
    owing,
  };
}

/** For the bills of one month: billed / collected / pending. */
export async function monthBilling(db: DB, month: string) {
  const rows = await invoiceBalances(db, eq(invoices.periodMonth, month));
  const t = { billed: 0, collected: 0, pending: 0 };
  for (const r of rows) {
    t.billed += r.totalPaise;
    t.collected += Math.min(r.paidPaise, r.totalPaise);
    t.pending += r.balance;
  }
  return t;
}

/** This month's unpaid bills, per tenant. Feeds the dashboard "mark as paid" list. */
export async function unpaidThisMonth(db: DB, month: string) {
  const rows = await invoiceBalances(db, eq(invoices.periodMonth, month));
  return rows
    .filter((r) => r.balance > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({ invoiceId: r.id, tenantId: r.tenantId, name: r.name, balance: r.balance }));
}

/** Everything still unpaid for the given tenants, oldest month first. */
export async function unpaidItemsByTenant(db: DB, tenantIds: string[]) {
  const out = new Map<string, { invoiceId: string; amount: number; month: string }[]>();
  if (!tenantIds.length) return out;
  const invs = (await invoiceBalances(db, inArray(invoices.tenantId, tenantIds))).sort((a, b) => a.periodMonth.localeCompare(b.periodMonth));
  for (const inv of invs) {
    if (inv.balance <= 0) continue;
    const list = out.get(inv.tenantId) ?? [];
    list.push({ invoiceId: inv.id, amount: inv.balance, month: inv.periodMonth });
    out.set(inv.tenantId, list);
  }
  return out;
}

/** Each tenant's payments (newest first, voided ones left out), so the Tenants list can show "who paid what". */
export async function paymentsByTenant(db: DB, tenantIds: string[], perTenant = 30) {
  const out = new Map<string, { id: string; paidOn: string; amount: number; method: string; month: string; receiptNo: string }[]>();
  if (!tenantIds.length) return out;
  const rows = await db
    .select({ id: payments.id, tenantId: payments.tenantId, paidOn: payments.paidOn, amount: payments.amountPaise, method: payments.method, receiptNo: payments.receiptNo, month: invoices.periodMonth })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(inArray(payments.tenantId, tenantIds), isNull(payments.voidedAt)))
    .orderBy(desc(payments.paidOn), desc(payments.createdAt));
  for (const r of rows) {
    const list = out.get(r.tenantId) ?? [];
    if (list.length >= perTenant) continue;
    list.push({ id: r.id, paidOn: r.paidOn, amount: r.amount, method: r.method, month: r.month, receiptNo: r.receiptNo });
    out.set(r.tenantId, list);
  }
  return out;
}

/**
 * The payments board: every ACTIVE tenant for one month and whether the rent is paid.
 * Tenants with no bill that month are still listed (`invoiceId` null) so nobody is missed.
 */
export async function paymentBoard(db: DB, month: string, today: string) {
  const tenants = await db
    .select({ id: tenantProfiles.id, name: users.name })
    .from(tenantProfiles)
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(ne(tenantProfiles.status, "moved_out"))
    .orderBy(asc(users.name));
  const invs = await invoiceBalances(db, eq(invoices.periodMonth, month));
  const byTenant = new Map(invs.map((i) => [i.tenantId, i]));
  return tenants.map((t) => {
    const inv = byTenant.get(t.id) ?? null;
    const rent = inv
      ? { amount: inv.totalPaise, balance: inv.balance, state: (inv.totalPaise === 0 ? "none" : inv.balance <= 0 ? "paid" : inv.paidPaise > 0 ? "partial" : today > inv.dueDate ? "overdue" : "unpaid") as "none" | "paid" | "partial" | "overdue" | "unpaid" }
      : null;
    return { tenantId: t.id, name: t.name, invoiceId: inv?.id ?? null, rent };
  });
}

/** Who still owes, and how much. */
export async function outstandingByTenant(db: DB) {
  const all = await invoiceBalances(db);
  const by = new Map<string, { tenantId: string; name: string; status: string; balance: number; oldestDue: string }>();
  for (const i of all) {
    if (i.balance <= 0) continue;
    const cur = by.get(i.tenantId) ?? { tenantId: i.tenantId, name: i.name, status: i.status, balance: 0, oldestDue: i.dueDate };
    cur.balance += i.balance;
    if (i.dueDate < cur.oldestDue) cur.oldestDue = i.dueDate;
    by.set(i.tenantId, cur);
  }
  return [...by.values()].sort((a, b) => b.balance - a.balance);
}

export type MonthRow = {
  month: string;
  invoiced: number;
  collected: number;
  outstanding: number;
};

/**
 * Month-wise summary. `collected` is CASH actually received (by payment date, voided excluded).
 * `invoiced` is billed amount by invoice period and is NOT income.
 */
export async function monthlySummary(db: DB, fromMonth: string, toMonth: string): Promise<MonthRow[]> {
  const rows = new Map<string, MonthRow>();
  for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) rows.set(m, { month: m, invoiced: 0, collected: 0, outstanding: 0 });
  const [inv, pays] = await Promise.all([
    db
      .select({ m: invoices.periodMonth, total: sql<number>`sum(${invoices.totalPaise})`, out: sql<number>`sum(max(${invoices.totalPaise} - ${invoices.paidPaise}, 0))` })
      .from(invoices)
      .where(and(gte(invoices.periodMonth, fromMonth), lte(invoices.periodMonth, toMonth)))
      .groupBy(invoices.periodMonth),
    db
      .select({ m: sql<string>`substr(${payments.paidOn}, 1, 7)`, total: sql<number>`sum(${payments.amountPaise})` })
      .from(payments)
      .where(and(isNull(payments.voidedAt), gte(payments.paidOn, monthStart(fromMonth)), lte(payments.paidOn, monthEnd(toMonth))))
      .groupBy(sql`substr(${payments.paidOn}, 1, 7)`),
  ]);
  for (const r of inv) {
    const row = rows.get(r.m);
    if (row) {
      row.invoiced = Number(r.total);
      row.outstanding = Number(r.out);
    }
  }
  for (const p of pays) {
    const row = rows.get(p.m);
    if (row) row.collected = Number(p.total);
  }
  return [...rows.values()];
}

/**
 * Every month from the first tenant's joining month (or first bill) up to this month, newest first,
 * with how many bills are paid, the cash collected in it, and how many reported payments wait for the owner.
 */
export async function monthList(db: DB, activity: { status: string; month: string }[]) {
  const [first] = await db.select({ d: sql<string | null>`min(${tenantProfiles.joiningDate})` }).from(tenantProfiles);
  const [firstBill] = await db.select({ m: sql<string | null>`min(${invoices.periodMonth})` }).from(invoices);
  const now = currentMonth();
  const start = [first?.d?.slice(0, 7), firstBill?.m].filter((x): x is string => !!x).sort()[0] ?? now;
  const bills = await invoiceBalances(db);
  const cash = await db
    .select({ m: sql<string>`substr(${payments.paidOn}, 1, 7)`, n: sql<number>`coalesce(sum(${payments.amountPaise}), 0)` })
    .from(payments)
    .where(isNull(payments.voidedAt))
    .groupBy(sql`substr(${payments.paidOn}, 1, 7)`);
  const cashBy = new Map(cash.map((c) => [c.m, Number(c.n)]));
  return monthsBetween(start, now < start ? start : now).map((month) => {
    const mine = bills.filter((b) => b.periodMonth === month && b.totalPaise > 0);
    return {
      month,
      bills: mine.length,
      paidBills: mine.filter((b) => b.balance <= 0).length,
      collected: cashBy.get(month) ?? 0,
      waiting: activity.filter((a) => a.status === "waiting" && a.month === month).length,
    };
  });
}
