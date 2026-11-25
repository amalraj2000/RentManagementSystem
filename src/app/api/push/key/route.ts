import { publicKey } from "@/services/push";

export const dynamic = "force-dynamic";

/** Public VAPID key (safe to expose). 404 when push is not configured. */
export async function GET() {
  const key = publicKey();
  if (!key) return Response.json({ error: "Push not configured" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({ key }, { headers: { "Cache-Control": "no-store" } });
}
