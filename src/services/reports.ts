import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db/client";
import { bedAssignments, expenses, invoiceItems, invoices, payments, rooms, tenantProfiles, users } from "@/db/schema";
import { addMonths, monthEnd, monthStart } from "@/lib/dates";
import { expenseLinesFor } from "./expense-lines";
import { categoryLabel } from "@/lib/categories";
import { allocatePayment, splitRentExpense, type Cat } from "@/lib/billing";

const outstandingExpr = sql<number>`coalesce(sum(max(${invoices.totalPaise} - ${invoices.paidPaise}, 0)), 0)`;

/** Every bill (optionally filtered) with its RENT and EXPENSES kept apart: what each costs and what is still unpaid on each. */
export async function invoiceSplits(db: DB, cond?: SQL) {
  const rows = await db
    .select({
      id: invoices.id, tenantId: invoices.tenantId, userId: users.id, name: users.name, status: tenantProfiles.status, periodMonth: invoices.periodMonth, dueDate: invoices.dueDate,
      rentPaid: invoices.rentPaidPaise, expensePaid: invoices.expensePaidPaise,
      rent: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'rent' then ${invoiceItems.amountPaise} else 0 end), 0)`,
      other: sql<number>`coalesce(sum(case when ${invoiceItems.kind} not in ('rent', 'adjustment') then ${invoiceItems.amountPaise} else 0 end), 0)`,
      adjustment: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'adjustment' then ${invoiceItems.amountPaise} else 0 end), 0)`,
    })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .leftJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
    .where(and(isNull(invoices.cancelledAt), cond))
    .groupBy(invoices.id, users.id, users.name, tenantProfiles.status);
  return rows.map((r) => ({ id: r.id, tenantId: r.tenantId, userId: r.userId, name: r.name, status: r.status, periodMonth: r.periodMonth, dueDate: r.dueDate, split: splitRentExpense({ rent: Number(r.rent), other: Number(r.other), adjustment: Number(r.adjustment) }, { rent: r.rentPaid, expense: r.expensePaid }) }));
}

export async function dashboardData(db: DB, month: string, today: string) {
  const [cap, residents, occupied, collected, pendingMonth, outstandingAll, utilities, spent, recent, upcoming, owing] = await Promise.all([
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
      .select({ type: expenses.category, total: sql<number>`sum(${expenses.amountPaise})` })
      .from(expenses)
      .where(and(inArray(expenses.category, ["electricity", "water"]), gte(expenses.spentOn, monthStart(month)), lte(expenses.spentOn, monthEnd(month))))
      .groupBy(expenses.category),
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
    invoiceSplits(db, gte(invoices.dueDate, today)).then((all) => all.filter((i) => i.split.rentBalance + i.split.expenseBalance > 0).sort((x, y) => x.dueDate.localeCompare(y.dueDate)).slice(0, 5).map((i) => ({ id: i.id, dueDate: i.dueDate, name: i.name, rent: i.split.rentBalance, expense: i.split.expenseBalance }))),
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
    split: await rentVsExpenses(db, month),
    electricity: utilities.find((u) => u.type === "electricity") ? Number(utilities.find((u) => u.type === "electricity")!.total) : null,
    water: utilities.find((u) => u.type === "water") ? Number(utilities.find((u) => u.type === "water")!.total) : null,
    expenses: Number(spent[0].n),
    recent,
    upcoming,
    owing,
  };
}

/** For the bills of one month: how much is RENT and how much is EXPENSES (utilities, shared, other), billed / collected / pending. */
export async function rentVsExpenses(db: DB, month: string) {
  const rows = await db
    .select({
      id: invoices.id,
      rentPaid: invoices.rentPaidPaise,
      expensePaid: invoices.expensePaidPaise,
      rent: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'rent' then ${invoiceItems.amountPaise} else 0 end), 0)`,
      other: sql<number>`coalesce(sum(case when ${invoiceItems.kind} not in ('rent', 'adjustment') then ${invoiceItems.amountPaise} else 0 end), 0)`,
      adjustment: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'adjustment' then ${invoiceItems.amountPaise} else 0 end), 0)`,
    })
    .from(invoices)
    .leftJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
    .where(and(eq(invoices.periodMonth, month), isNull(invoices.cancelledAt)))
    .groupBy(invoices.id);
  const t = { rentBilled: 0, rentCollected: 0, rentPending: 0, expenseBilled: 0, expenseCollected: 0, expensePending: 0 };
  for (const r of rows) {
    const s = splitRentExpense({ rent: Number(r.rent), other: Number(r.other), adjustment: Number(r.adjustment) }, { rent: r.rentPaid, expense: r.expensePaid });
    t.rentBilled += s.rentPayable;
    t.rentCollected += s.rentCovered;
    t.rentPending += s.rentBalance;
    t.expenseBilled += s.expensePayable;
    t.expenseCollected += s.expenseCovered;
    t.expensePending += s.expenseBalance;
  }
  return t;
}

/** This month's EXPENSES split by what they are for (electricity, water, gas cylinder, other): what tenants were charged, have paid, still owe. */
export async function expenseByCategory(db: DB, month: string) {
  const rows = await db
    .select({ itemId: invoiceItems.id, invoiceId: invoices.id, kind: invoiceItems.kind, category: expenses.category })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoices.id, invoiceItems.invoiceId))
    .leftJoin(expenses, eq(expenses.id, invoiceItems.expenseId))
    .where(and(eq(invoices.periodMonth, month), isNull(invoices.cancelledAt), sql`${invoiceItems.kind} not in ('rent', 'adjustment')`));
  const lines = await expenseLinesFor(db, [...new Set(rows.map((r) => r.invoiceId))]);
  const out: Record<string, { billed: number; collected: number; pending: number }> = { electricity: { billed: 0, collected: 0, pending: 0 }, water: { billed: 0, collected: 0, pending: 0 }, cooking_gas: { billed: 0, collected: 0, pending: 0 }, other: { billed: 0, collected: 0, pending: 0 } };
  for (const r of rows) {
    const l = lines.get(r.invoiceId)?.get(r.itemId);
    if (!l) continue;
    const key = r.category === "electricity" || r.kind === "electricity" ? "electricity" : r.category === "water" || r.kind === "water" ? "water" : r.category === "cooking_gas" ? "cooking_gas" : "other";
    out[key].billed += l.payable;
    out[key].collected += l.covered;
    out[key].pending += l.balance;
  }
  return out;
}

/** This month's unpaid bills, per tenant: the rent still due and each expense line still due. Feeds the dashboard "mark as paid" list. */
export async function unpaidThisMonth(db: DB, month: string) {
  const invs = await db
    .select({ id: invoices.id, tenantId: invoices.tenantId, name: users.name, rentPaid: invoices.rentPaidPaise, expensePaid: invoices.expensePaidPaise })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(and(eq(invoices.periodMonth, month), isNull(invoices.cancelledAt)))
    .orderBy(asc(users.name));
  if (!invs.length) return [];
  const ids = invs.map((i) => i.id);
  const items = await db
    .select({ id: invoiceItems.id, invoiceId: invoiceItems.invoiceId, kind: invoiceItems.kind, amountPaise: invoiceItems.amountPaise, category: expenses.category })
    .from(invoiceItems)
    .leftJoin(expenses, eq(expenses.id, invoiceItems.expenseId))
    .where(inArray(invoiceItems.invoiceId, ids));
  const lines = await expenseLinesFor(db, ids);
  const out = [];
  for (const inv of invs) {
    const its = items.filter((i) => i.invoiceId === inv.id);
    const sum = (f: (i: (typeof its)[number]) => boolean) => its.filter(f).reduce((a, i) => a + i.amountPaise, 0);
    const split = splitRentExpense({ rent: sum((i) => i.kind === "rent"), other: sum((i) => i.kind !== "rent" && i.kind !== "adjustment"), adjustment: sum((i) => i.kind === "adjustment") }, { rent: inv.rentPaid, expense: inv.expensePaid });
    const due = its
      .map((i) => ({ i, l: lines.get(inv.id)?.get(i.id) }))
      .filter((x) => x.l && x.l.balance > 0)
      .map((x) => ({ itemId: x.i.id, category: x.i.category ?? (x.i.kind === "electricity" || x.i.kind === "water" ? x.i.kind : "other"), balance: x.l!.balance }));
    if (split.rentBalance > 0 || due.length) out.push({ invoiceId: inv.id, tenantId: inv.tenantId, name: inv.name, rentBalance: split.rentBalance, lines: due });
  }
  return out;
}

/**
 * Everything still unpaid for the given tenants, oldest first — each rent month and each expense line on its own.
 * `key` is what the "Mark paid" dialog sends back: "rent|<invoiceId>" or "line|<invoiceId>|<itemId>".
 */
export async function unpaidItemsByTenant(db: DB, tenantIds: string[]) {
  const out = new Map<string, { key: string; label: string; amount: number; month: string; kind: "rent" | "expense" }[]>();
  if (!tenantIds.length) return out;
  const invs = (await invoiceSplits(db, inArray(invoices.tenantId, tenantIds))).sort((a, b) => a.periodMonth.localeCompare(b.periodMonth));
  if (!invs.length) return out;
  const ids = invs.map((i) => i.id);
  const items = await db
    .select({ id: invoiceItems.id, invoiceId: invoiceItems.invoiceId, kind: invoiceItems.kind, category: expenses.category })
    .from(invoiceItems)
    .leftJoin(expenses, eq(expenses.id, invoiceItems.expenseId))
    .where(and(inArray(invoiceItems.invoiceId, ids), sql`${invoiceItems.kind} not in ('rent', 'adjustment')`));
  const lines = await expenseLinesFor(db, ids);
  for (const inv of invs) {
    const list = out.get(inv.tenantId) ?? [];
    if (inv.split.rentBalance > 0) list.push({ key: `rent|${inv.id}`, label: "Rent", amount: inv.split.rentBalance, month: inv.periodMonth, kind: "rent" });
    for (const it of items.filter((x) => x.invoiceId === inv.id)) {
      const l = lines.get(inv.id)?.get(it.id);
      if (!l || l.balance <= 0) continue;
      list.push({ key: `line|${inv.id}|${it.id}`, label: categoryLabel(it.category ?? (it.kind === "electricity" || it.kind === "water" ? it.kind : "other")), amount: l.balance, month: inv.periodMonth, kind: "expense" });
    }
    if (list.length) out.set(inv.tenantId, list);
  }
  return out;
}

/** Each tenant's payments (newest first, voided ones left out), so the Tenants list can show "who paid what". Rent and expenses stay apart. */
export async function paymentsByTenant(db: DB, tenantIds: string[], perTenant = 30) {
  const out = new Map<string, { id: string; paidOn: string; amount: number; method: string; purpose: "rent" | "expense"; month: string; what: string; receiptNo: string }[]>();
  if (!tenantIds.length) return out;
  const rows = await db
    .select({ id: payments.id, tenantId: payments.tenantId, paidOn: payments.paidOn, amount: payments.amountPaise, method: payments.method, purpose: payments.purpose, itemId: payments.invoiceItemId, receiptNo: payments.receiptNo, month: invoices.periodMonth })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(inArray(payments.tenantId, tenantIds), isNull(payments.voidedAt)))
    .orderBy(desc(payments.paidOn), desc(payments.createdAt));
  const itemIds = [...new Set(rows.flatMap((r) => (r.itemId ? [r.itemId] : [])))];
  const items = itemIds.length
    ? await db.select({ id: invoiceItems.id, kind: invoiceItems.kind, category: expenses.category }).from(invoiceItems).leftJoin(expenses, eq(expenses.id, invoiceItems.expenseId)).where(inArray(invoiceItems.id, itemIds))
    : [];
  const labelOf = new Map(items.map((i) => [i.id, categoryLabel(i.category ?? (i.kind === "electricity" || i.kind === "water" ? i.kind : "other"))]));
  for (const r of rows) {
    const list = out.get(r.tenantId) ?? [];
    if (list.length >= perTenant) continue;
    list.push({ id: r.id, paidOn: r.paidOn, amount: r.amount, method: r.method, purpose: r.purpose, month: r.month, what: r.purpose === "rent" ? "Rent" : (r.itemId && labelOf.get(r.itemId)) || "Expenses", receiptNo: r.receiptNo });
    out.set(r.tenantId, list);
  }
  return out;
}

/** Who still owes — with the RENT they owe and the EXPENSES they owe kept apart. */
export async function outstandingByTenant(db: DB) {
  const all = await invoiceSplits(db);
  const by = new Map<string, { tenantId: string; name: string; status: string; rent: number; expense: number; balance: number; oldestDue: string }>();
  for (const i of all) {
    if (i.split.rentBalance + i.split.expenseBalance <= 0) continue;
    const cur = by.get(i.tenantId) ?? { tenantId: i.tenantId, name: i.name, status: i.status, rent: 0, expense: 0, balance: 0, oldestDue: i.dueDate };
    cur.rent += i.split.rentBalance;
    cur.expense += i.split.expenseBalance;
    cur.balance = cur.rent + cur.expense;
    if (i.dueDate < cur.oldestDue) cur.oldestDue = i.dueDate;
    by.set(i.tenantId, cur);
  }
  return [...by.values()].sort((a, b) => b.balance - a.balance);
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
 * attributed to Rent or to the expense lines (electricity, water, other) according to what each payment was FOR.
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
    // earlier payments of the SAME purpose on the same bill have already taken part of its lines
    const used = new Map<string, Record<Cat, number>>();
    for (const p of allPays) {
      const k = `${p.invoiceId}:${p.purpose}`;
      const u = used.get(k) ?? { rent: 0, electricity: 0, water: 0, other: 0 };
      const split = allocatePayment(itemsBy.get(p.invoiceId) ?? [], p.purpose, p.amountPaise, u);
      for (const c of Object.keys(split) as Cat[]) u[c] += split[c];
      used.set(k, u);
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
