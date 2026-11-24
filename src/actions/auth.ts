"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { authenticate, destroyUserSessions, hashPassword, passwordProblem, sha256, verifyPassword } from "@/lib/auth-core";
import { run, fd } from "@/lib/action";
import { clientIp, endSession, getCurrentUser, requireUser, startSession } from "@/lib/session";
import { AppError, audit } from "@/services/common";
import { cookies } from "next/headers";
import { removeUserPhoto, setUserPhoto } from "@/services/avatars";
import { revalidatePath } from "next/cache";

const loginSchema = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });

export async function login(formData: FormData) {
  return run(async () => {
    const parsed = loginSchema.safeParse(fd(formData));
    if (!parsed.success) throw new AppError("Enter your email and password");
    const db = getDb();
    const r = await authenticate(db, parsed.data.email, parsed.data.password, await clientIp());
    if (!r.ok) {
      // Recorded against the account (when it exists) so admins can see attempts in that user's logs.
      if (r.userId) await audit(db, r.userId, "auth.login_failed", "user", r.userId, { ip: await clientIp() });
      throw new AppError("Incorrect email or password", "password");
    }
    await startSession(r.userId);
    await audit(db, r.userId, "auth.login", "user", r.userId, { ip: await clientIp() });
    redirect(r.role === "admin" ? "/admin" : "/portal");
  });
}

export async function logout() {
  const me = await getCurrentUser();
  if (me) await audit(getDb(), me.id, "auth.logout", "user", me.id);
  await endSession();
  redirect("/");
}

const pwSchema = z.object({ current: z.string().min(1).max(200), next: z.string().max(200), confirm: z.string().max(200) });

export async function changePassword(formData: FormData) {
  return run(async () => {
    const me = await requireUser();
    if (me.impersonatedBy) throw new AppError("You're viewing as this tenant, so changes are turned off.");
    const d = pwSchema.parse(fd(formData));
    if (d.next !== d.confirm) throw new AppError("New passwords do not match", "confirm");
    const problem = passwordProblem(d.next);
    if (problem) throw new AppError(problem, "next");
    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.id, me.id));
    if (!u || !(await verifyPassword(u.passwordHash, d.current))) throw new AppError("Current password is incorrect", "current");
    await db.update(users).set({ passwordHash: await hashPassword(d.next), mustChangePassword: false }).where(eq(users.id, me.id));
    // Logout every other device, keep this one.
    const jar = await cookies();
    const token = jar.get(process.env.NODE_ENV === "production" ? "__Host-pg_session" : "pg_session")?.value;
    await destroyUserSessions(db, me.id, token ? sha256(token) : undefined);
    await audit(db, me.id, "auth.password_change", "user", me.id);
    return "Password updated";
  });
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  phone: z.string().trim().max(20).refine((v) => !v || /^[+\d][\d\s-]{6,17}$/.test(v), "Enter a valid mobile number"),
});

export async function updateProfile(formData: FormData) {
  return run(async () => {
    const me = await requireUser();
    const d = profileSchema.parse(fd(formData));
    const db = getDb();
    const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email));
    if (dupe && dupe.id !== me.id) throw new AppError("That email is already in use", "email");
    await db.update(users).set({ name: d.name, email: d.email, phone: d.phone || null }).where(eq(users.id, me.id));
    await audit(db, me.id, "auth.profile_update", "user", me.id);
    revalidatePath("/", "layout");
    return "Profile updated";
  });
}

export async function logoutOtherDevices() {
  return run(async () => {
    const me = await requireUser();
    const token = (await cookies()).get(process.env.NODE_ENV === "production" ? "__Host-pg_session" : "pg_session")?.value;
    await destroyUserSessions(getDb(), me.id, token ? sha256(token) : undefined);
    await audit(getDb(), me.id, "auth.signout_others", "user", me.id);
    return "Logged out of all other devices";
  });
}

const fileOf = (f: FormData, name: string) => {
  const v = f.get(name);
  return v instanceof File && v.size > 0 ? v : null;
};

/** Any logged-in admin changing THEIR OWN photo. */
export async function updateMyPhotoAdminAction(formData: FormData) {
  return run(async () => {
    const me = await requireUser();
    if (me.role !== "admin" || me.impersonatedBy) throw new AppError("Not allowed");
    const file = fileOf(formData, "file");
    if (!file) throw new AppError("Choose a photo first", "file");
    await setUserPhoto(getDb(), me.id, file);
    revalidatePath("/", "layout");
    return "Profile photo updated";
  });
}

export async function removeMyPhotoAdminAction() {
  return run(async () => {
    const me = await requireUser();
    if (me.role !== "admin" || me.impersonatedBy) throw new AppError("Not allowed");
    await removeUserPhoto(getDb(), me.id);
    revalidatePath("/", "layout");
    return "Profile photo removed";
  });
}
