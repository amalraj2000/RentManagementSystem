import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { expenses, expenseShares, tenantProfiles, users } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { formatINR, splitEqually } from "@/lib/money";
import { AppError, audit } from "./common";
import { notifyAdmins, notifyTenant } from "./notifications";
import { tenantForUser } from "./portal";

export type ExpenseInput = { title: string; note?: string | null; amountPaise: number; expenseDate: string };
type Method = "cash" | "upi";

/**
 * Adds an expense and splits it equally between everyone who is an ACTIVE tenant right now
 * (the list is a snapshot, so tenants who join later are not charged for it).
 */
export async function createExpense(db: DB, actorId: string, input: ExpenseInput) {
  return db.transaction(async (tx) => {
    const tenants = await tx.select({ id: tenantProfiles.id }).from(tenantProfiles).where(ne(tenantProfiles.status, "moved_out")).orderBy(asc(tenantProfiles.id));
    if (!tenants.length) throw new AppError("There are no active tenants to share this expense with");
    const [exp] = await tx
      .insert(expenses)
      .values({ title: input.title, note: input.note || null, amountPaise: input.amountPaise, expenseDate: input.expenseDate, createdBy: actorId })
      .returning({ id: expenses.id });
    const parts = splitEqually(input.amountPaise, tenants.length);
    if (parts.some((p) => p <= 0)) throw new AppError("The amount is too small to split between all active tenants", "amount");
    await tx.insert(expenseShares).values(tenants.map((t, i) => ({ expenseId: exp.id, tenantId: t.id, amountPaise: parts[i] })));
    await audit(tx, actorId, "expense.create", "expense", exp.id, { title: input.title, amount: input.amountPaise, tenants: tenants.length });
    for (const [i, t] of tenants.entries()) {
      await notifyTenant(tx, t.id, { type: "expense_added", title: `New expense: ${input.title}`, body: `Your share is ${formatINR(parts[i])}.`, href: "/portal/expenses", dedupeKey: `expense:${exp.id}` });
    }
    return exp.id;
  });
}

/** Title, note and date can always change. The amount can only change while nobody has paid (or reported paying) their share. */
export async function updateExpense(db: DB, actorId: string, id: string, input: ExpenseInput) {
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(expenses).where(eq(expenses.id, id));
    if (!cur) throw new AppError("Expense not found");
    if (input.amountPaise !== cur.amountPaise) {
      const shares = await tx.select().from(expenseShares).where(eq(expenseShares.expenseId, id)).orderBy(asc(expenseShares.tenantId));
      if (shares.some((s) => s.status !== "due")) throw new AppError("Some tenants have already paid, so the amount can't change. You can still edit the title, date and note.", "amount");
      const parts = splitEqually(input.amountPaise, shares.length);
      if (parts.some((p) => p <= 0)) throw new AppError("The amount is too small to split between the tenants", "amount");
      for (const [i, s] of shares.entries()) await tx.update(expenseShares).set({ amountPaise: parts[i] }).where(eq(expenseShares.id, s.id));
    }
    await tx.update(expenses).set({ title: input.title, note: input.note || null, amountPaise: input.amountPaise, expenseDate: input.expenseDate }).where(eq(expenses.id, id));
    await audit(tx, actorId, "expense.update", "expense", id, { title: input.title, amount: input.amountPaise });
  });
}

export async function deleteExpense(db: DB, actorId: string, id: string) {
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(expenses).where(eq(expenses.id, id));
    if (!cur) throw new AppError("Expense not found");
    const [busy] = await tx.select({ id: expenseShares.id }).from(expenseShares).where(and(eq(expenseShares.expenseId, id), ne(expenseShares.status, "due"))).limit(1);
    if (busy) throw new AppError("Some tenants have already paid (or reported paying) this expense, so it can't be deleted. Take those back first.");
    await tx.delete(expenses).where(eq(expenses.id, id));
    await audit(tx, actorId, "expense.delete", "expense", id, { title: cur.title });
  });
}

async function shareOf(tx: Pick<DB, "select">, shareId: string) {
  const [row] = await tx
    .select({ s: expenseShares, title: expenses.title })
    .from(expenseShares)
    .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
    .where(eq(expenseShares.id, shareId));
  if (!row) throw new AppError("That share was not found");
  return row;
}

/** Owner: "this tenant has paid" — also how a reported payment is confirmed. */
export async function markSharePaid(db: DB, actorId: string, shareId: string, method: Method = "cash", today = todayISO()) {
  await db.transaction(async (tx) => {
    const { s, title } = await shareOf(tx, shareId);
    if (s.status === "paid") throw new AppError("Already marked as paid");
    await tx.update(expenseShares).set({ status: "paid", method: s.method ?? method, paidOn: s.paidOn ?? today }).where(eq(expenseShares.id, shareId));
    await audit(tx, actorId, s.status === "waiting" ? "expense.confirm" : "expense.mark_paid", "expense", s.expenseId, { tenantId: s.tenantId, amount: s.amountPaise });
    await notifyTenant(tx, s.tenantId, { type: "expense_paid", title: "Expense payment confirmed", body: `${title} · ${formatINR(s.amountPaise)} is marked as paid.`, href: "/portal/expenses" });
  });
}

/** Owner: take a payment back to "due" (marked by mistake). */
export async function revertSharePaid(db: DB, actorId: string, shareId: string) {
  await db.transaction(async (tx) => {
    const { s } = await shareOf(tx, shareId);
    if (s.status === "due") throw new AppError("This share is already due");
    await tx.update(expenseShares).set({ status: "due", method: null, paidOn: null }).where(eq(expenseShares.id, shareId));
    await audit(tx, actorId, s.status === "waiting" ? "expense.reject" : "expense.revert", "expense", s.expenseId, { tenantId: s.tenantId });
  });
}

/** Tenant: "I have paid my share". Nothing is settled until the owner confirms. */
export async function reportSharePaid(db: DB, userId: string, shareId: string, method: Method) {
  await db.transaction(async (tx) => {
    const me = await tenantForUser(tx as unknown as DB, userId);
    if (!me) throw new AppError("Tenant profile not found");
    const { s, title } = await shareOf(tx, shareId);
    if (s.tenantId !== me.id) throw new AppError("That share was not found");
    if (s.status !== "due") throw new AppError(s.status === "paid" ? "This is already paid" : "You have already told the owner you paid");
    await tx.update(expenseShares).set({ status: "waiting", method, paidOn: todayISO() }).where(eq(expenseShares.id, shareId));
    await audit(tx, userId, "expense.report", "expense", s.expenseId, { amount: s.amountPaise });
    await notifyAdmins(tx, { type: "expense_reported", title: `${me.name} says they paid an expense`, body: `${title} · ${formatINR(s.amountPaise)} · ${method.toUpperCase()}. Please confirm.`, href: `/admin/expenses/${s.expenseId}`, dedupeKey: `expense-report:${shareId}` }, userId);
  });
}

export async function listExpenses(db: DB) {
  const rows = await db.select().from(expenses).orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
  if (!rows.length) return [];
  const shares = await db
    .select({ expenseId: expenseShares.expenseId, status: expenseShares.status, n: sql<number>`count(*)` })
    .from(expenseShares)
    .where(inArray(expenseShares.expenseId, rows.map((r) => r.id)))
    .groupBy(expenseShares.expenseId, expenseShares.status);
  return rows.map((e) => {
    const mine = shares.filter((s) => s.expenseId === e.id);
    const count = (st: string) => Number(mine.find((s) => s.status === st)?.n ?? 0);
    const total = count("due") + count("waiting") + count("paid");
    return { ...e, paid: count("paid"), waiting: count("waiting"), total };
  });
}

/** One expense with every tenant's share and status. */
export async function expenseDetail(db: DB, id: string) {
  const [exp] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!exp) return null;
  const shares = await db
    .select({ id: expenseShares.id, tenantId: expenseShares.tenantId, name: users.name, amountPaise: expenseShares.amountPaise, status: expenseShares.status, method: expenseShares.method, paidOn: expenseShares.paidOn, tenantStatus: tenantProfiles.status })
    .from(expenseShares)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, expenseShares.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(eq(expenseShares.expenseId, id))
    .orderBy(asc(users.name));
  return { exp, shares };
}

/** A tenant's own shares, newest first. */
export async function myExpenseShares(db: DB, userId: string) {
  const me = await tenantForUser(db, userId);
  if (!me) return [];
  return db
    .select({ id: expenseShares.id, title: expenses.title, note: expenses.note, date: expenses.expenseDate, totalPaise: expenses.amountPaise, amountPaise: expenseShares.amountPaise, status: expenseShares.status, method: expenseShares.method, paidOn: expenseShares.paidOn })
    .from(expenseShares)
    .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
    .where(eq(expenseShares.tenantId, me.id))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
}
