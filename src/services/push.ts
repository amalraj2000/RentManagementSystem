import { after } from "next/server";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";

export type PushPayload = { title: string; body: string; url?: string | null };

const pub = () => process.env.VAPID_PUBLIC_KEY?.trim();
export const pushEnabled = () => !!(pub() && process.env.VAPID_PRIVATE_KEY?.trim() && process.env.VAPID_SUBJECT?.trim());
export const publicKey = () => (pushEnabled() ? pub()! : null);

/** Only internal paths may be a click target. */
export const safeUrl = (u?: string | null) => (u && u.startsWith("/") && !u.startsWith("//") && !u.includes("\\") ? u : "/");

/** Sends to every device of one user. Never throws; does nothing when VAPID keys are not configured. Dead subscriptions (404/410) are removed. */
export async function sendPush(userId: string, p: PushPayload) {
  if (!pushEnabled()) return;
  try {
    const db = getDb();
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    if (!subs.length) return;
    const body = JSON.stringify({ title: p.title.slice(0, 120), body: p.body.slice(0, 300), url: safeUrl(p.url) });
    const opts = { vapidDetails: { subject: process.env.VAPID_SUBJECT!.trim(), publicKey: pub()!, privateKey: process.env.VAPID_PRIVATE_KEY!.trim() }, timeout: 8000, TTL: 86400 };
    const dead: string[] = [];
    await Promise.all(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, opts).catch((e: { statusCode?: number }) => {
          if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.endpoint);
        }),
      ),
    );
    if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, dead));
  } catch {
    /* push is best-effort */
  }
}

/** Fire-and-forget after the response (so the DB transaction has committed); falls back to a plain call outside a request. */
export function queuePush(userIds: string[], p: PushPayload) {
  if (!pushEnabled() || !userIds.length) return;
  const job = () => Promise.all(userIds.map((id) => sendPush(id, p))).then(() => undefined);
  try {
    after(job);
  } catch {
    void job();
  }
}
