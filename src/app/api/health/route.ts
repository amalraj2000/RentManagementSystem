import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

/**
 * Liveness + DB reachability. Returns no secrets, versions or data — only a short reason code when the database can't be used,
 * so a wrong deployment setting can be found without reading logs:
 *   missing_env  → TURSO_DATABASE_URL is not set on this deployment
 *   no_token     → a remote (libsql://) database is used but TURSO_AUTH_TOKEN is not set
 *   unreachable  → both are set, but the connection / token was refused (wrong URL, expired or wrong token)
 *   no_schema    → connected, but migrations have not been run on that database
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) return Response.json({ status: "degraded", reason: "missing_env" }, { status: 503, headers });
  if (url.startsWith("libsql://") && !process.env.TURSO_AUTH_TOKEN) return Response.json({ status: "degraded", reason: "no_token" }, { status: 503, headers });
  try {
    const db = getDb();
    await db.run(sql`select 1`);
    try {
      await db.run(sql`select 1 from users limit 1`);
    } catch {
      return Response.json({ status: "degraded", reason: "no_schema" }, { status: 503, headers });
    }
    return Response.json({ status: "ok" }, { headers });
  } catch {
    return Response.json({ status: "degraded", reason: "unreachable" }, { status: 503, headers });
  }
}
