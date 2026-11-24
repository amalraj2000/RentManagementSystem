import { desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { announcements, rentSettings } from "@/db/schema";
import { notifyAllTenants } from "./notifications";
import { AppError, audit } from "./common";

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
  s: { defaultRentPaise: number; dueDayOfMonth: number; houseRules: string; contactInfo: string; upiId: string; upiPayeeName: string },
) {
  await db.update(rentSettings).set(s).where(eq(rentSettings.id, 1));
  await audit(db, actorId, "settings.update", "settings", "1", { dueDay: s.dueDayOfMonth });
}

export async function updateAnnouncement(db: DB, actorId: string, id: string, a: { title: string; body: string; pinned: boolean }) {
  const [cur] = await db.select({ id: announcements.id }).from(announcements).where(eq(announcements.id, id));
  if (!cur) throw new AppError("Notice not found");
  await db.update(announcements).set(a).where(eq(announcements.id, id));
  await audit(db, actorId, "announcement.update", "announcement", id);
}
