import { and, desc, eq, like, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLogs, sessions, tenantProfiles, users } from "@/db/schema";
import { formatINR } from "@/lib/money";

export const CATEGORIES = [
  ["all", "All"],
  ["auth", "Logins"],
  ["payment", "Payments"],
  ["claim", "Payment reports"],
  ["invoice", "Invoices"],
  ["tenant", "Tenants"],
  ["expense", "Expenses"],
  ["utility", "Utilities"],
  ["room", "Rooms"],
  ["document", "Files"],
  ["admin", "Admins"],
  ["settings", "Settings"],
  ["website", "Landing page"],
  ["impersonate", "Admin view"],
] as const;
export type Category = (typeof CATEGORIES)[number][0];

const LABELS: Record<string, string> = {
  "auth.login": "Logged in",
  "auth.login_failed": "Failed login attempt",
  "auth.login_blocked": "Login blocked (too many attempts)",
  "auth.logout": "Logged out",
  "auth.password_change": "Changed own password",
  "auth.profile_update": "Updated own profile",
  "auth.signout_others": "Logged out other devices",
  "payment.record": "Recorded a payment",
  "payment.void": "Voided a payment",
  "payment.update": "Edited a payment",
  "claim.create": "Reported a payment",
  "claim.approve": "Confirmed a reported payment",
  "claim.reject": "Rejected a reported payment",
  "invoice.generate": "Generated invoices",
  "invoice.adjustment": "Applied a discount",
  "invoice.other": "Added a charge",
  "invoice.delete": "Deleted an invoice",
  "tenant.create": "Added a tenant",
  "tenant.update": "Edited a tenant",
  "tenant.move_out": "Vacated a tenant",
  "tenant.delete": "Deleted a tenant",
  "tenant.password_reset": "Reset a tenant's password",
  "tenant.login_enable": "Enabled a tenant's login",
  "tenant.login_disable": "Disabled a tenant's login",
  "bed.assign": "Assigned a bed",
  "bed.unassign": "Removed from bed",
  "expense.create": "Added an expense",
  "expense.update": "Edited an expense",
  "expense.delete": "Deleted an expense",
  "utility.create": "Added a utility bill",
  "utility.update": "Edited a utility bill",
  "utility.delete": "Deleted a utility bill",
  "room.create": "Added a room",
  "room.update": "Edited a room",
  "room.delete": "Deleted a room",
  "document.photo_set": "Set a profile photo",
  "document.photo_removed": "Removed own profile photo",
  "document.id_add": "Added an ID document",
  "document.delete": "Deleted a file",
  "admin.create": "Added an admin",
  "admin.update": "Edited an admin",
  "admin.delete": "Deleted an admin",
  "admin.enable": "Enabled an admin",
  "admin.disable": "Disabled an admin",
  "admin.password_reset": "Reset an admin's password",
  "announcement.create": "Posted a notice",
  "announcement.update": "Edited a notice",
  "announcement.delete": "Deleted a notice",
  "settings.update": "Changed settings",
  "website.update": "Updated the landing page",
  "website.photo_add": "Added a landing page photo",
  "website.photo_delete": "Removed a landing page photo",
  "impersonate.start": "Admin logged in as this tenant (read-only)",
  "impersonate.stop": "Admin returned to admin account",
  "payment.collect_all": "Collected all dues together",
};
export const actionLabel = (a: string) => LABELS[a] ?? a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const MONEY_KEYS = new Set(["amount", "total", "claimed", "before", "after"]);
/** Turns the stored JSON details into short readable pairs (amounts in paise → ₹). */
export function describeDetails(raw: string | null): { k: string; v: string }[] {
  if (!raw) return [];
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return [];
    return Object.entries(o)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .slice(0, 6)
      .map(([k, v]) => ({ k: k.replace(/([A-Z])/g, " $1").toLowerCase(), v: MONEY_KEYS.has(k) && typeof v === "number" ? formatINR(v) : String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 80) }));
  } catch {
    return [];
  }
}

const actorCount = sql<number>`(select count(*) from ${auditLogs} where ${auditLogs.actorId} = ${users.id})`;
const lastActivity = sql<number | null>`(select max(${auditLogs.createdAt}) from ${auditLogs} where ${auditLogs.actorId} = ${users.id})`;

export async function listUsersWithActivity(db: DB, opts: { role?: "admin" | "tenant"; q?: string; limit: number; offset: number }) {
  const conds = [];
  if (opts.role) conds.push(eq(users.role, opts.role));
  if (opts.q?.trim()) {
    const like_ = `%${opts.q.trim().replace(/[%_]/g, "")}%`;
    conds.push(or(like(users.name, like_), like(users.email, like_)));
  }
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, lastLoginAt: users.lastLoginAt, actions: actorCount, last: lastActivity, tenantStatus: tenantProfiles.status })
    .from(users)
    .leftJoin(tenantProfiles, eq(tenantProfiles.userId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(sql`coalesce(${lastActivity}, 0)`), users.name)
    .limit(opts.limit)
    .offset(opts.offset);
  return rows.map((r) => ({ ...r, actions: Number(r.actions), last: r.last == null ? null : new Date(Number(r.last)) }));
}

export async function countUsers(db: DB, opts: { role?: "admin" | "tenant"; q?: string }) {
  const conds = [];
  if (opts.role) conds.push(eq(users.role, opts.role));
  if (opts.q?.trim()) {
    const like_ = `%${opts.q.trim().replace(/[%_]/g, "")}%`;
    conds.push(or(like(users.name, like_), like(users.email, like_)));
  }
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(users).where(conds.length ? and(...conds) : undefined);
  return Number(r.n);
}

export async function getLoggedUser(db: DB, id: string) {
  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt, tenantId: tenantProfiles.id, tenantStatus: tenantProfiles.status })
    .from(users)
    .leftJoin(tenantProfiles, eq(tenantProfiles.userId, users.id))
    .where(eq(users.id, id));
  if (!u) return null;
  const [s] = await db.select({ n: sql<number>`count(*)` }).from(sessions).where(and(eq(sessions.userId, id), sql`${sessions.expiresAt} > ${Date.now()}`));
  return { ...u, activeSessions: Number(s.n) };
}

/**
 * scope "by":    things this user DID (they are the actor)
 * scope "about": things done TO this user's account / tenant record by someone else
 */
function logConds(user: { id: string; tenantId: string | null }, opts: { scope: "by" | "about"; category: Category }) {
  const where = [];
  if (opts.scope === "by") where.push(eq(auditLogs.actorId, user.id));
  else {
    const about = [and(eq(auditLogs.entity, "user"), eq(auditLogs.entityId, user.id))];
    if (user.tenantId) about.push(and(eq(auditLogs.entity, "tenant"), eq(auditLogs.entityId, user.tenantId)));
    where.push(or(...about));
    where.push(sql`(${auditLogs.actorId} is null or ${auditLogs.actorId} != ${user.id})`); // self-actions belong under "by"
  }
  if (opts.category !== "all") where.push(like(auditLogs.action, `${opts.category}.%`));
  return and(...where);
}

export async function countUserLogs(db: DB, user: { id: string; tenantId: string | null }, opts: { scope: "by" | "about"; category: Category }) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(auditLogs).where(logConds(user, opts));
  return Number(r.n);
}

/**
 * scope "by":    things this user DID (they are the actor)
 * scope "about": things done TO this user's account / tenant record by someone else
 */
export async function userLogs(db: DB, user: { id: string; tenantId: string | null }, opts: { scope: "by" | "about"; category: Category; limit: number; offset: number }) {
  const actor = db.$with("actor").as(db.select({ id: users.id, name: users.name }).from(users));
  return db
    .with(actor)
    .select({ id: auditLogs.id, action: auditLogs.action, entity: auditLogs.entity, entityId: auditLogs.entityId, details: auditLogs.details, at: auditLogs.createdAt, actorName: actor.name })
    .from(auditLogs)
    .leftJoin(actor, eq(actor.id, auditLogs.actorId))
    .where(logConds(user, opts))
    .orderBy(desc(auditLogs.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}
