import { and, asc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { users } from "@/db/schema";
import { destroyUserSessions, hashPassword, passwordProblem } from "@/lib/auth-core";
import { AppError, audit } from "./common";
import { notifyAdmins } from "./notifications";

export const listAdmins = (db: DB) =>
  db.select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt }).from(users).where(eq(users.role, "admin")).orderBy(asc(users.createdAt));

export async function createAdminUser(db: DB, actorId: string, input: { name: string; email: string; password: string }) {
  const problem = passwordProblem(input.password);
  if (problem) throw new AppError(problem, "password");
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    const [dupe] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (dupe) throw new AppError("A user with this email already exists", "email");
    const [u] = await tx.insert(users).values({ email, name: input.name.trim(), role: "admin", passwordHash, mustChangePassword: true }).returning({ id: users.id });
    await audit(tx, actorId, "admin.create", "user", u.id, { email });
    await notifyAdmins(tx, { type: "admin_added", title: "New admin added", body: `${input.name.trim()} (${email}) was given admin access.`, href: "/admin/admins" }, [actorId, u.id]);
  });
}

async function target(db: DB, id: string) {
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, "admin")));
  if (!u) throw new AppError("Admin not found");
  return u;
}

/** Guards: you can't lock yourself out, and at least one active admin must always remain. */
export async function setAdminActive(db: DB, actorId: string, id: string, active: boolean) {
  const u = await target(db, id);
  if (!active) {
    if (id === actorId) throw new AppError("You can't disable your own account");
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "admin"), eq(users.isActive, true)));
    if (u.isActive && Number(n) <= 1) throw new AppError("At least one active admin is required");
  }
  await db.update(users).set({ isActive: active }).where(eq(users.id, id));
  if (!active) await destroyUserSessions(db, id);
  await audit(db, actorId, active ? "admin.enable" : "admin.disable", "user", id);
}

export async function resetAdminPassword(db: DB, actorId: string, id: string, password: string) {
  if (id === actorId) throw new AppError("Change your own password from My profile");
  const problem = passwordProblem(password);
  if (problem) throw new AppError(problem, "password");
  await target(db, id);
  await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true }).where(eq(users.id, id));
  await destroyUserSessions(db, id);
  await audit(db, actorId, "admin.password_reset", "user", id);
}

export async function updateAdminUser(db: DB, actorId: string, id: string, input: { name: string; email: string }) {
  await target(db, id);
  const email = input.email.trim().toLowerCase();
  const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (dupe && dupe.id !== id) throw new AppError("A user with this email already exists", "email");
  await db.update(users).set({ name: input.name.trim(), email }).where(eq(users.id, id));
  await audit(db, actorId, "admin.update", "user", id);
}

/** Hard delete only when nothing references the admin; otherwise ask to disable instead (history is kept). */
export async function deleteAdminUser(db: DB, actorId: string, id: string) {
  const u = await target(db, id);
  if (id === actorId) throw new AppError("You can't delete your own account");
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "admin"), eq(users.isActive, true)));
  if (u.isActive && Number(n) <= 1) throw new AppError("At least one active admin is required");
  try {
    await db.delete(users).where(eq(users.id, id));
  } catch {
    throw new AppError("This admin has recorded payments or bills, so they can't be deleted. Disable them instead.");
  }
  await audit(db, actorId, "admin.delete", "user", id, { email: u.email });
}
