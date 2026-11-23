import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

export function createDb(url: string, authToken?: string): { db: DB; client: Client } {
  const client = createClient({ url, authToken });
  return { db: drizzle(client, { schema }), client };
}

let cached: DB | undefined;

/** Server-only singleton (reused across invocations in a warm serverless instance). */
export function getDb(): DB {
  if (!cached) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL is not set");
    cached = createDb(url, process.env.TURSO_AUTH_TOKEN).db;
  }
  return cached;
}
