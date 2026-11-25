import { and, desc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { invoices, notifications, tenantProfiles, users } from "@/db/schema";
import { invoiceBalances } from "./reports";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { Q } from "./common";
import { queuePush } from "./push";

export type NotificationInput = { type: string; title: string; body: string; href?: string | null; dedupeKey?: string | null };

/** Inserts for each user; a repeated dedupeKey for the same user is silently skipped. Never throws on duplicates. */
export async function notifyUsers(q: Q, userIds: string[], n: NotificationInput) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  const made = await q
    .insert(notifications)
    .values(ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, href: n.href ?? null, dedupeKey: n.dedupeKey ?? null })))
    .onConflictDoNothing()
    .returning({ userId: notifications.userId });
  queuePush(made.map((r) => r.userId), { title: n.title, body: n.body, url: n.href }); // only newly created rows, so repeats never re-push
}

export async function adminIds(q: Q, except?: string | null | (string | null)[]) {
  const skip = new Set([except].flat());
  const rows = await q.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.isActive, true)));
  return rows.map((r) => r.id).filter((id) => !skip.has(id));
}

export async function tenantUserId(q: Q, tenantId: string) {
  const [r] = await q.select({ userId: tenantProfiles.userId }).from(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
  return r?.userId ?? null;
}

export async function notifyAdmins(q: Q, n: NotificationInput, except?: string | null | (string | null)[]) {
  await notifyUsers(q, await adminIds(q, except), n);
}

export async function notifyTenant(q: Q, tenantId: string, n: NotificationInput) {
  const uid = await tenantUserId(q, tenantId);
  if (uid) await notifyUsers(q, [uid], n);
}

export async function notifyAllTenants(q: Q, n: NotificationInput) {
  const rows = await q
    .select({ id: users.id })
    .from(users)
    .innerJoin(tenantProfiles, eq(tenantProfiles.userId, users.id))
    .where(and(eq(users.role, "tenant"), eq(users.isActive, true), ne(tenantProfiles.status, "moved_out")));
  await notifyUsers(q, rows.map((r) => r.id), n);
}

export async function tenantName(q: Q, tenantId: string) {
  const [r] = await q.select({ name: users.name }).from(tenantProfiles).innerJoin(users, eq(users.id, tenantProfiles.userId)).where(eq(tenantProfiles.id, tenantId));
  return r?.name ?? "A tenant";
}

// ---- reading (always scoped to the logged-in user's id) ----
export async function unreadCount(db: DB, userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(r.n);
}

export async function countNotifications(db: DB, userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(notifications).where(eq(notifications.userId, userId));
  return Number(r.n);
}

export const listNotifications = (db: DB, userId: string, limit: number, offset: number) =>
  db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit).offset(offset);

/** Returns the href so the caller can redirect. A user can only ever touch their own rows. */
export async function markRead(db: DB, userId: string, id: string) {
  const [n] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  if (!n) return null;
  if (!n.readAt) await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
  return n.href;
}

export async function markAllRead(db: DB, userId: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

// ---- daily reminders (called by the cron route and, best-effort, lazily) ----
const DUE_SOON_DAYS = 2;
const addDays = (d: string, n: number) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);

/** Idempotent per invoice thanks to dedupe keys: running it many times a day notifies once. */
export async function runReminders(db: DB, today: string, now = Date.now()) {
  const open = await invoiceBalances(db).then((all) => all.filter((i) => i.balance > 0));
  let made = 0;
  const admins = await adminIds(db);
  for (const inv of open) {
    if (today > inv.dueDate) {
      await notifyUsers(db, [inv.userId], { type: "invoice_overdue", title: "Payment overdue", body: `Your ${monthLabel(inv.periodMonth)} rent ${formatINR(inv.balance)} was due on ${formatDate(inv.dueDate)}.`, href: `/portal/invoices/${inv.id}`, dedupeKey: `overdue:${inv.id}` });
      await notifyUsers(db, admins, { type: "invoice_overdue", title: `${inv.name} is overdue`, body: `${monthLabel(inv.periodMonth)} · ${formatINR(inv.balance)} outstanding, due ${formatDate(inv.dueDate)}.`, href: `/admin/invoices/${inv.id}`, dedupeKey: `overdue:${inv.id}` });
      made++;
    } else if (inv.dueDate <= addDays(today, DUE_SOON_DAYS)) {
      await notifyUsers(db, [inv.userId], { type: "invoice_due_soon", title: "Payment due soon", body: `Your ${monthLabel(inv.periodMonth)} rent ${formatINR(inv.balance)} is due on ${formatDate(inv.dueDate)}.`, href: `/portal/invoices/${inv.id}`, dedupeKey: `due:${inv.id}` });
      made++;
    }
  }
  // Housekeeping: drop read notifications older than 90 days.
  await db.delete(notifications).where(and(sql`${notifications.readAt} is not null`, lt(notifications.createdAt, new Date(now - 90 * 86400_000))));
  return { checked: open.length, considered: made };
}
