import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { bedAssignments, expenses, invoiceItems, invoices, payments, rooms, tenantProfiles, users, utilityBills } from "@/db/schema";
import { addMonths, monthEnd, monthStart } from "@/lib/dates";
import { waterfall, type Cat } from "@/lib/billing";

const outstandingExpr = sql<number>`coalesce(sum(max(${invoices.totalPaise} - ${invoices.paidPaise}, 0)), 0)`;

export async function dashboardData(db: DB, month: string, today: string) {
  const [cap, residents, occupied, collected, pendingMonth, outstandingAll, utilities, spent, recent, upcoming, owing] = await Promise.all([
    db.select({ n: sql<number>`coalesce(sum(${rooms.maxOccupancy}), 0)` }).from(rooms),
    db.select({ n: sql<number>`count(*)` }).from(tenantProfiles).where(ne(tenantProfiles.status, "moved_out")),
    db.select({ n: sql<number>`count(*)` }).from(bedAssignments).where(isNull(bedAssignments.endDate)),
    db
      .select({ n: sql<number>`coalesce(sum(${payments.amountPaise}), 0)` })
      .from(payments)
      .where(and(isNull(payments.voidedAt), gte(payments.paidOn, monthStart(month)), lte(payments.paidOn, monthEnd(month)))),
    db.select({ n: outstandingExpr }).from(invoices).where(eq(invoices.periodMonth, month)),
    db.select({ n: outstandingExpr }).from(invoices),
    db.select({ type: utilityBills.type, total: utilityBills.totalPaise }).from(utilityBills).where(eq(utilityBills.periodMonth, month)),
    db
      .select({ n: sql<number>`coalesce(sum(${expenses.amountPaise}), 0)` })
      .from(expenses)
      .where(and(gte(expenses.spentOn, monthStart(month)), lte(expenses.spentOn, monthEnd(month)))),
    db
      .select({ id: payments.id, amount: payments.amountPaise, paidOn: payments.paidOn, method: payments.method, name: users.name })
      .from(payments)
      .innerJoin(tenantProfiles, eq(tenantProfiles.id, payments.tenantId))
      .innerJoin(users, eq(users.id, tenantProfiles.userId))
      .where(isNull(payments.voidedAt))
      .orderBy(desc(payments.paidOn), desc(payments.createdAt))
      .limit(5),
    db
      .select({ id: invoices.id, dueDate: invoices.dueDate, balance: sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}`, name: users.name })
      .from(invoices)
      .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
      .innerJoin(users, eq(users.id, tenantProfiles.userId))
      .where(and(sql`${invoices.totalPaise} > ${invoices.paidPaise}`, gte(invoices.dueDate, today)))
      .orderBy(asc(invoices.dueDate))
      .limit(5),
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
    electricity: utilities.find((u) => u.type === "electricity")?.total ?? null,
    water: utilities.find((u) => u.type === "water")?.total ?? null,
    expenses: Number(spent[0].n),
    recent,
    upcoming,
    owing,
  };
}

export async function outstandingByTenant(db: DB) {
  const rows = await db
    .select({
      tenantId: tenantProfiles.id,
      name: users.name,
      status: tenantProfiles.status,
      balance: sql<number>`sum(${invoices.totalPaise} - ${invoices.paidPaise})`,
      oldestDue: sql<string>`min(${invoices.dueDate})`,
    })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(sql`${invoices.totalPaise} > ${invoices.paidPaise}`)
    .groupBy(tenantProfiles.id, users.name, tenantProfiles.status)
    .orderBy(desc(sql`sum(${invoices.totalPaise} - ${invoices.paidPaise})`));
  return rows.map((r) => ({ ...r, balance: Number(r.balance) }));
}

export type MonthRow = {
  month: string;
  invoiced: number;
  collected: Record<Cat, number> & { total: number };
  expenses: number;
  expensesByCategory: Record<string, number>;
  net: number;
  outstanding: number;
};

/**
 * Month-wise summary. `collected` is CASH actually received (by payment date, voided excluded),
 * attributed to categories via a rent->electricity->water->other waterfall per invoice.
 * `invoiced` is billed amount by invoice period and is NOT income.
 */
export async function monthlySummary(db: DB, fromMonth: string, toMonth: string): Promise<MonthRow[]> {
  const rows = new Map<string, MonthRow>();
  for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) {
    rows.set(m, { month: m, invoiced: 0, collected: { rent: 0, electricity: 0, water: 0, other: 0, total: 0 }, expenses: 0, expensesByCategory: {}, net: 0, outstanding: 0 });
  }
  const [inv, exp, pays] = await Promise.all([
    db
      .select({ m: invoices.periodMonth, total: sql<number>`sum(${invoices.totalPaise})`, out: sql<number>`sum(max(${invoices.totalPaise} - ${invoices.paidPaise}, 0))` })
      .from(invoices)
      .where(and(gte(invoices.periodMonth, fromMonth), lte(invoices.periodMonth, toMonth)))
      .groupBy(invoices.periodMonth),
    db
      .select({ m: sql<string>`substr(${expenses.spentOn}, 1, 7)`, cat: expenses.category, total: sql<number>`sum(${expenses.amountPaise})` })
      .from(expenses)
      .where(and(gte(expenses.spentOn, monthStart(fromMonth)), lte(expenses.spentOn, monthEnd(toMonth))))
      .groupBy(sql`substr(${expenses.spentOn}, 1, 7)`, expenses.category),
    db
      .select({ invoiceId: payments.invoiceId })
      .from(payments)
      .where(and(isNull(payments.voidedAt), gte(payments.paidOn, monthStart(fromMonth)), lte(payments.paidOn, monthEnd(toMonth)))),
  ]);
  for (const r of inv) {
    const row = rows.get(r.m);
    if (row) {
      row.invoiced = Number(r.total);
      row.outstanding = Number(r.out);
    }
  }
  for (const e of exp) {
    const row = rows.get(e.m);
    if (row) {
      row.expenses += Number(e.total);
      row.expensesByCategory[e.cat] = Number(e.total);
    }
  }
  const invoiceIds = [...new Set(pays.map((p) => p.invoiceId))];
  if (invoiceIds.length) {
    const [allPays, items] = await Promise.all([
      db.select().from(payments).where(and(isNull(payments.voidedAt), inArray(payments.invoiceId, invoiceIds))).orderBy(asc(payments.paidOn), asc(payments.createdAt)),
      db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds)),
    ]);
    const itemsBy = new Map<string, typeof items>();
    for (const i of items) itemsBy.set(i.invoiceId, [...(itemsBy.get(i.invoiceId) ?? []), i]);
    const used = new Map<string, Record<Cat, number>>();
    for (const p of allPays) {
      const u = used.get(p.invoiceId) ?? { rent: 0, electricity: 0, water: 0, other: 0 };
      const split = waterfall(itemsBy.get(p.invoiceId) ?? [], p.amountPaise, u);
      for (const c of Object.keys(split) as Cat[]) u[c] += split[c];
      used.set(p.invoiceId, u);
      const row = rows.get(p.paidOn.slice(0, 7));
      if (row) {
        for (const c of Object.keys(split) as Cat[]) row.collected[c] += split[c];
        row.collected.total += p.amountPaise;
      }
    }
  }
  for (const r of rows.values()) r.net = r.collected.total - r.expenses;
  return [...rows.values()];
}
