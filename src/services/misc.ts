import { desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { announcements, expenseReceipts, expenses, rentSettings } from "@/db/schema";
import type { ValidFile } from "./documents";
import { categoryLabel, type ExpenseCategory } from "@/lib/categories";
import type { Q } from "./common";
import { applyShare, removeShares, type ShareInput } from "./expense-shares";
import { notifyAllTenants } from "./notifications";
import { AppError, audit } from "./common";

async function saveReceipt(q: Q, expenseId: string, f: ValidFile) {
  await q.delete(expenseReceipts).where(eq(expenseReceipts.expenseId, expenseId));
  await q.insert(expenseReceipts).values({ expenseId, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.data.length, data: f.data });
}

export async function addExpense(
  db: DB,
  actorId: string,
  e: { category: ExpenseCategory; amountPaise: number; spentOn: string; description?: string; receiptRef?: string | null; receipt?: ValidFile | null; share?: ShareInput },
) {
  const { receipt, share, ...rest } = e;
  const fields = { ...rest, description: rest.description?.trim() || categoryLabel(rest.category) };
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(expenses).values({ ...fields, receiptRef: fields.receiptRef || null, createdBy: actorId }).returning({ id: expenses.id });
    if (receipt) await saveReceipt(tx, row.id, receipt);
    if (share && share.mode !== "none") {
      await applyShare(tx, actorId, { id: row.id, category: fields.category, description: fields.description, amountPaise: fields.amountPaise, spentOn: fields.spentOn, shareMode: "none" }, null, share);
    }
    await audit(tx, actorId, "expense.create", "expense", row.id, { category: e.category, amount: e.amountPaise, image: !!receipt, share: share?.mode ?? "none" });
    return row.id;
  });
}

/** Admin-only read of an expense's receipt image. */
export async function getReceiptImage(db: DB, expenseId: string) {
  const [r] = await db.select().from(expenseReceipts).where(eq(expenseReceipts.expenseId, expenseId));
  if (!r) return null;
  return { mimeType: r.mimeType, fileName: r.fileName, data: Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data as unknown as ArrayBuffer) };
}

export async function receiptInfo(db: DB, expenseId: string) {
  const [r] = await db.select({ fileName: expenseReceipts.fileName, sizeBytes: expenseReceipts.sizeBytes }).from(expenseReceipts).where(eq(expenseReceipts.expenseId, expenseId));
  return r ?? null;
}

export async function deleteExpense(db: DB, actorId: string, id: string) {
  const [e] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!e) throw new AppError("Expense not found");
  if (e.utilityBillId) throw new AppError("This expense belongs to a utility bill. Delete the utility bill instead.");
  await db.transaction(async (tx) => {
    await removeShares(tx, id); // also blocks if tenants already paid invoices containing this shared expense
    await tx.delete(expenses).where(eq(expenses.id, id));
    await audit(tx, actorId, "expense.delete", "expense", id, { amount: e.amountPaise, category: e.category });
  });
}

export async function postAnnouncement(db: DB, actorId: string, a: { title: string; body: string; pinned: boolean }) {
  const [row] = await db.insert(announcements).values({ ...a, createdBy: actorId }).returning({ id: announcements.id });
  await audit(db, actorId, "announcement.create", "announcement", row.id);
  await notifyAllTenants(db, { type: "announcement", title: `New notice: ${a.title}`, body: a.body.length > 140 ? `${a.body.slice(0, 137)}…` : a.body, href: "/portal/notices", dedupeKey: `announcement:${row.id}` });
}

export async function deleteAnnouncement(db: DB, actorId: string, id: string) {
  await db.delete(announcements).where(eq(announcements.id, id));
  await audit(db, actorId, "announcement.delete", "announcement", id);
}

export const listAnnouncements = (db: DB, limit = 20) =>
  db.select().from(announcements).orderBy(desc(announcements.pinned), desc(announcements.createdAt)).limit(limit);

export async function updateSettings(
  db: DB,
  actorId: string,
  s: { defaultRentPaise: number; dueDayOfMonth: number; electricityMethod: "equal_residents" | "equal_beds" | "custom"; waterMethod: "equal_residents" | "custom"; houseRules: string; contactInfo: string },
) {
  await db.update(rentSettings).set(s).where(eq(rentSettings.id, 1));
  await audit(db, actorId, "settings.update", "settings", "1", { dueDay: s.dueDayOfMonth });
}

export async function updateExpense(
  db: DB,
  actorId: string,
  id: string,
  e: { category: ExpenseCategory; amountPaise: number; spentOn: string; description?: string; receiptRef?: string | null; receipt?: ValidFile | null; removeReceipt?: boolean; share?: ShareInput },
) {
  const { receipt, removeReceipt, share, ...rest } = e;
  const fields = { ...rest, description: rest.description?.trim() || categoryLabel(rest.category) };
  const [cur] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!cur) throw new AppError("Expense not found");
  if (cur.utilityBillId) throw new AppError("This expense belongs to a utility bill. Edit the bill instead.");
  await db.transaction(async (tx) => {
    await tx.update(expenses).set({ ...fields, receiptRef: fields.receiptRef || null }).where(eq(expenses.id, id));
    if (share) {
      await applyShare(tx, actorId, { id, category: fields.category, description: fields.description, amountPaise: fields.amountPaise, spentOn: fields.spentOn, shareMode: cur.shareMode }, { id, category: cur.category, description: cur.description, amountPaise: cur.amountPaise, spentOn: cur.spentOn, shareMode: cur.shareMode }, share);
    }
    if (receipt) await saveReceipt(tx, id, receipt);
    else if (removeReceipt) await tx.delete(expenseReceipts).where(eq(expenseReceipts.expenseId, id));
    await audit(tx, actorId, "expense.update", "expense", id, { before: cur.amountPaise, after: e.amountPaise, image: receipt ? "set" : removeReceipt ? "removed" : "kept" });
  });
}

export async function updateAnnouncement(db: DB, actorId: string, id: string, a: { title: string; body: string; pinned: boolean }) {
  const [cur] = await db.select({ id: announcements.id }).from(announcements).where(eq(announcements.id, id));
  if (!cur) throw new AppError("Notice not found");
  await db.update(announcements).set(a).where(eq(announcements.id, id));
  await audit(db, actorId, "announcement.update", "announcement", id);
}
