import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const H = { "Cache-Control": "no-store" };

const sub = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "https only"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
const del = z.object({ endpoint: z.string().max(1000) });

/** Saves this device for the logged-in user. Upserts by endpoint, so a shared phone moves to whoever is logged in now. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: H });
  const parsed = sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid subscription" }, { status: 400, headers: H });
  const { endpoint, keys } = parsed.data;
  await getDb()
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth } });
  return Response.json({ ok: true }, { headers: H });
}

/** Removes a device by endpoint. Called on logout, when the session cookie may already be gone, so it is not auth-gated (the endpoint is an unguessable secret). */
export async function DELETE(req: Request) {
  const parsed = del.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400, headers: H });
  await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint));
  return Response.json({ ok: true }, { headers: H });
}
