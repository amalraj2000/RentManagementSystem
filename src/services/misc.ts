import { desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { announcements, expenses, rentSettings } from "@/db/schema";
import { AppError, audit } from "./common";

export async function addExpense(
  db: DB,
  actorId: string,
  e: { category: "electricity" | "water" | "cleaning" | "repairs" | "internet" | "other"; amountPaise: number; spentOn: string; description: string; receiptRef?: string | null },
) {
  const [row] = await db.insert(expenses).values({ ...e, receiptRef: e.receiptRef || null, createdBy: actorId }).returning({ id: expenses.id });
  await audit(db, actorId, "expense.create", "expense", row.id, { category: e.category, amount: e.amountPaise });
}

export async function deleteExpense(db: DB, actorId: string, id: string) {
  const [e] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!e) throw new AppError("Expense not found");
  if (e.utilityBillId) throw new AppError("This expense belongs to a utility bill. Delete the utility bill instead.");
  await db.delete(expenses).where(eq(expenses.id, id));
  await audit(db, actorId, "expense.delete", "expense", id, { amount: e.amountPaise, category: e.category });
}

export async function postAnnouncement(db: DB, actorId: string, a: { title: string; body: string; pinned: boolean }) {
  const [row] = await db.insert(announcements).values({ ...a, createdBy: actorId }).returning({ id: announcements.id });
  await audit(db, actorId, "announcement.create", "announcement", row.id);
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
