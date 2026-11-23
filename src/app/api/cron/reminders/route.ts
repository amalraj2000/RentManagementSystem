import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { todayISO } from "@/lib/dates";
import { runReminders } from "@/services/notifications";

export const dynamic = "force-dynamic";

/** Daily job (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok = given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response("Unauthorized", { status: 401 });
  const r = await runReminders(getDb(), todayISO());
  return Response.json({ status: "ok", ...r }, { headers: { "Cache-Control": "no-store" } });
}
