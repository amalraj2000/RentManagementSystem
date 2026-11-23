import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, lt } from "drizzle-orm";
import type { DB } from "@/db/client";
import { loginAttempts, sessions, users } from "@/db/schema";

export const SESSION_DAYS = 7;
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

// Argon2id (library default algorithm), OWASP-aligned parameters.
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (pw: string) => hash(pw, ARGON);
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let dummyHash: Promise<string> | undefined;

export const IMPERSONATION_MINUTES = 60;

export async function createSession(db: DB, userId: string, userAgent?: string | null, now = Date.now(), opts: { impersonatedBy?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  // Admin "login as tenant" sessions are short-lived; normal sessions last SESSION_DAYS.
  const expiresAt = new Date(now + (opts.impersonatedBy ? IMPERSONATION_MINUTES * 60_000 : SESSION_DAYS * 86400_000));
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200) ?? null, impersonatedBy: opts.impersonatedBy ?? null });
  return { token, expiresAt };
}

export async function getSessionUser(db: DB, token: string | undefined, now = Date.now()) {
  if (!token) return null;
  const rows = await db
    .select({
      sessionId: sessions.id,
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      impersonatedBy: sessions.impersonatedBy,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date(now)), eq(users.isActive, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function destroySession(db: DB, token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function destroyUserSessions(db: DB, userId: string, exceptSessionId?: string) {
  const all = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  for (const s of all) if (s.id !== exceptSessionId) await db.delete(sessions).where(eq(sessions.id, s.id));
}

export async function purgeExpiredSessions(db: DB, now = Date.now()) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date(now)));
}

/** Returns ms remaining if locked, else 0. */
export async function lockRemaining(db: DB, key: string, now = Date.now()) {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key));
  if (row?.lockedUntil && row.lockedUntil.getTime() > now) return row.lockedUntil.getTime() - now;
  return 0;
}

export async function recordFailure(db: DB, key: string, now = Date.now()) {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key));
  if (!row || now - row.windowStart.getTime() > WINDOW_MS) {
    await db
      .insert(loginAttempts)
      .values({ key, failures: 1, windowStart: new Date(now) })
      .onConflictDoUpdate({ target: loginAttempts.key, set: { failures: 1, windowStart: new Date(now), lockedUntil: null } });
    return;
  }
  const failures = row.failures + 1;
  await db
    .update(loginAttempts)
    .set({ failures, lockedUntil: failures >= MAX_FAILURES ? new Date(now + LOCK_MS) : null })
    .where(eq(loginAttempts.key, key));
}

export async function clearFailures(db: DB, key: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}

export type LoginResult =
  | { ok: true; userId: string; role: "admin" | "tenant" }
  | { ok: false; reason: "invalid" | "locked"; retryAfterMs?: number; userId?: string };

/** Constant-ish-time login with per-(email, ip) lockout. Same error for unknown user / bad password. */
export async function authenticate(db: DB, email: string, password: string, ip: string, now = Date.now()): Promise<LoginResult> {
  const e = email.trim().toLowerCase();
  const key = sha256(`${e}|${ip}`);
  const locked = await lockRemaining(db, key, now);
  const [user] = await db.select().from(users).where(eq(users.email, e));
  if (locked) return { ok: false, reason: "locked", retryAfterMs: locked, userId: user?.id };

  dummyHash ??= hashPassword("dummy-password-for-timing");
  const valid = user && user.isActive ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(await dummyHash, password), false);
  if (!user || !valid) {
    await recordFailure(db, key, now);
    return { ok: false, reason: "invalid", userId: user?.id };
  }
  await clearFailures(db, key);
  await db.update(users).set({ lastLoginAt: new Date(now) }).where(eq(users.id, user.id));
  return { ok: true, userId: user.id, role: user.role };
}

export const PASSWORD_MIN = 10;
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (pw.length > 128) return "Password is too long";
  return null;
}
