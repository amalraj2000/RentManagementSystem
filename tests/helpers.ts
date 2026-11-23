import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import { createAdmin, ensureBaseData } from "@/services/setup";
import { createTenant } from "@/services/tenants";
import { beds, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function testDb(): Promise<DB> {
  const dir = mkdtempSync(path.join(tmpdir(), "pgtest-"));
  const client = createClient({ url: `file:${path.join(dir, "t.db")}` });
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema }) as DB;
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
  await ensureBaseData(db);
  return db;
}

export async function seedAdmin(db: DB) {
  await createAdmin(db, "owner@example.test", "Owner", "Sup3rSecret99");
  const [a] = await db.select().from(users).where(eq(users.email, "owner@example.test"));
  return a.id;
}

export async function allBeds(db: DB) {
  const rows = await db.select().from(beds);
  return rows;
}

let n = 0;
export async function addTenant(db: DB, actor: string, opts: { rent?: number; bedId?: string | null; joining?: string; name?: string } = {}) {
  n++;
  return createTenant(db, actor, {
    name: opts.name ?? `Tenant ${n}`,
    email: `t${n}-${crypto.randomUUID().slice(0, 4)}@example.test`,
    phone: "9000000000",
    joiningDate: opts.joining ?? "2026-01-01",
    monthlyRentPaise: opts.rent ?? 600000,
    securityDepositPaise: 600000,
    password: "Passw0rdTest1",
    bedId: opts.bedId ?? null,
  });
}
