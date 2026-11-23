import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { beds, rentSettings, rooms, users } from "@/db/schema";
import { hashPassword, passwordProblem } from "@/lib/auth-core";

/** Idempotent: 2 rooms x 4 beds + the singleton settings row. */
export async function ensureBaseData(db: DB) {
  await db.insert(rentSettings).values({ id: 1, pgName: "Loveshore" }).onConflictDoNothing();
  for (const name of ["Bedroom 1", "Bedroom 2"]) {
    await db.insert(rooms).values({ name, maxOccupancy: 4 }).onConflictDoNothing();
    const [room] = await db.select().from(rooms).where(eq(rooms.name, name));
    for (let n = 1; n <= 4; n++) await db.insert(beds).values({ roomId: room.id, bedNumber: n }).onConflictDoNothing();
  }
}

export async function createAdmin(db: DB, email: string, name: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const e = email.trim().toLowerCase();
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, e));
  if (exists) throw new Error("A user with this email already exists");
  await db.insert(users).values({ email: e, name, role: "admin", passwordHash: await hashPassword(password) });
}
