import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { DB } from "../src/db/client";
import { createAdmin, ensureBaseData } from "../src/services/setup";
import { createTenant } from "../src/services/tenants";
import { recordPayment, syncInvoices } from "../src/services/billing";
import { createUtilityBill } from "../src/services/utilities";
import { addExpense, postAnnouncement } from "../src/services/misc";
import { addMonths, currentMonth } from "../src/lib/dates";

/** FICTIONAL demo data only. Refuses to run unless SEED_CONFIRM=yes so it can't pollute production by accident. */
async function main() {
  if (process.env.SEED_CONFIRM !== "yes") throw new Error("Demo seeding adds fake data. Re-run with SEED_CONFIRM=yes against a throwaway database.");
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  const db = drizzle(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }), { schema }) as DB;
  await ensureBaseData(db);
  await createAdmin(db, "admin@demo.test", "Demo Owner", "DemoAdmin2026");
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.email, "admin@demo.test"));
  const beds = await db.select().from(schema.beds).orderBy(schema.beds.roomId, schema.beds.bedNumber);
  const names = ["Asha Demo", "Bina Sample", "Chitra Example", "Divya Test", "Esha Fictional", "Farah Mock"];
  const m = currentMonth();
  const ids: string[] = [];
  for (const [i, name] of names.entries()) {
    ids.push(
      await createTenant(db, admin.id, {
        name, email: `tenant${i + 1}@demo.test`, phone: `90000000${String(i + 10)}`,
        joiningDate: `${addMonths(m, -3)}-01`, monthlyRentPaise: (5000 + i * 250) * 100, securityDepositPaise: 500000,
        emergencyContactName: "Demo Contact", emergencyContactPhone: "9000000000", password: "DemoTenant2026", bedId: beds[i < 3 ? i : i + 1].id,
      }),
    );
  }
  for (const month of [addMonths(m, -2), addMonths(m, -1), m]) {
    await createUtilityBill(db, admin.id, { type: "electricity", periodMonth: month, totalPaise: 1_234_567, method: "equal_residents", billDate: `${month}-28`, dueDate: `${addMonths(month, 1)}-10`, openingReading: 1000, closingReading: 1450 });
    await createUtilityBill(db, admin.id, { type: "water", periodMonth: month, totalPaise: 90_000, method: "equal_residents", billDate: `${month}-28`, dueDate: `${addMonths(month, 1)}-10` });
    await syncInvoices(db, admin.id, month);
  }
  const invs = await db.select().from(schema.invoices).where(eq(schema.invoices.periodMonth, addMonths(m, -1)));
  for (const inv of invs.slice(0, 4)) await recordPayment(db, admin.id, { invoiceId: inv.id, amountPaise: inv.totalPaise, paidOn: `${addMonths(m, -1)}-04`, method: "upi", reference: "DEMO-UPI" });
  await addExpense(db, admin.id, { category: "cleaning", amountPaise: 250000, spentOn: `${m}-03`, description: "Monthly cleaning (demo)" });
  await postAnnouncement(db, admin.id, { title: "Welcome (demo)", body: "Demo notice. Water supply is off 10–12 on Sundays.", pinned: true });
  console.log("Seeded. Admin: admin@demo.test / DemoAdmin2026 · Tenants: tenant1@demo.test … / DemoTenant2026");
}
main().catch((e) => { console.error(e); process.exit(1); });
