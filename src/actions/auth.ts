"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { authenticate, destroyUserSessions, hashPassword, passwordProblem, sha256, verifyPassword } from "@/lib/auth-core";
import { run, fd } from "@/lib/action";
import { clientIp, endSession, requireUser, startSession } from "@/lib/session";
import { AppError, audit } from "@/services/common";
import { cookies } from "next/headers";

const loginSchema = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });

export async function login(formData: FormData) {
  return run(async () => {
    const parsed = loginSchema.safeParse(fd(formData));
    if (!parsed.success) throw new AppError("Enter your email and password");
    const db = getDb();
    const r = await authenticate(db, parsed.data.email, parsed.data.password, await clientIp());
    if (!r.ok) {
      if (r.reason === "locked") throw new AppError(`Too many attempts. Try again in ${Math.ceil((r.retryAfterMs ?? 0) / 60000)} minute(s).`);
      throw new AppError("Incorrect email or password");
    }
    await startSession(r.userId);
    await audit(db, r.userId, "auth.login", "user", r.userId);
    redirect(r.role === "admin" ? "/admin" : "/portal");
  });
}

export async function logout() {
  await endSession();
  redirect("/login");
}

const pwSchema = z.object({ current: z.string().min(1).max(200), next: z.string().max(200), confirm: z.string().max(200) });

export async function changePassword(formData: FormData) {
  return run(async () => {
    const me = await requireUser();
    const d = pwSchema.parse(fd(formData));
    if (d.next !== d.confirm) throw new AppError("New passwords do not match");
    const problem = passwordProblem(d.next);
    if (problem) throw new AppError(problem);
    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.id, me.id));
    if (!u || !(await verifyPassword(u.passwordHash, d.current))) throw new AppError("Current password is incorrect");
    await db.update(users).set({ passwordHash: await hashPassword(d.next), mustChangePassword: false }).where(eq(users.id, me.id));
    // Sign out every other device, keep this one.
    const jar = await cookies();
    const token = jar.get(process.env.NODE_ENV === "production" ? "__Host-pg_session" : "pg_session")?.value;
    await destroyUserSessions(db, me.id, token ? sha256(token) : undefined);
    await audit(db, me.id, "auth.password_change", "user", me.id);
    return "Password updated";
  });
}
