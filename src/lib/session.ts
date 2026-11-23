import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { createSession, destroySession, getSessionUser } from "./auth-core";

const COOKIE = process.env.NODE_ENV === "production" ? "__Host-pg_session" : "pg_session";

export async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function startSession(userId: string) {
  const ua = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(getDb(), userId, ua);
  await setSessionCookie(token, expiresAt);
}

export async function endSession() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await destroySession(getDb(), t);
  jar.delete(COOKIE);
}

/** Per-request memoised current user. Role always comes from the DB, never from the client. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  return getSessionUser(getDb(), token);
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/portal");
  return u;
}

export async function requireTenant(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "tenant") redirect("/admin");
  return u;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
