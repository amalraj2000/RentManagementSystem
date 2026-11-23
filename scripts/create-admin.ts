import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/db/schema";
import { createAdmin, ensureBaseData } from "../src/services/setup";
import type { DB } from "../src/db/client";

/** One-off admin provisioning. Reads ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD from the environment of THIS command only. */
async function main() {
  const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_NAME) for this command");
  if (!TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL is not set");
  const db = drizzle(createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN }), { schema }) as DB;
  await ensureBaseData(db);
  await createAdmin(db, ADMIN_EMAIL, ADMIN_NAME || "Owner", ADMIN_PASSWORD);
  console.log(`Admin created: ${ADMIN_EMAIL}. Rooms, beds and settings are initialised.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
