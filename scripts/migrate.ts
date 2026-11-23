import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  const fk = await client.execute("PRAGMA foreign_keys");
  console.log("Migrations applied. foreign_keys =", fk.rows[0]?.foreign_keys);
  client.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
