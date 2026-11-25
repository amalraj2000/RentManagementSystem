import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { currentMonth } from "@/lib/dates";
import { syncInvoices } from "@/services/billing";

export const dynamic = "force-dynamic";

/** Monthly job (see vercel.json): creates the current month's invoices for all eligible tenants. Idempotent. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok = given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response("Unauthorized", { status: 401 });
  const month = currentMonth();
  const r = await syncInvoices(getDb(), null, month);
  return Response.json({ status: "ok", month, ...r }, { headers: { "Cache-Control": "no-store" } });
}
