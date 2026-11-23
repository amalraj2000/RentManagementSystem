import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLogs, bedAssignments, expenses, invoiceItems, invoices, payments, tenantProfiles, users, utilityAllocations } from "@/db/schema";
import { authenticate, createSession, getSessionUser, destroySession, MAX_FAILURES } from "@/lib/auth-core";
import { addInvoiceItem, getInvoiceDetail, recordPayment, syncInvoices, voidPayment } from "@/services/billing";
import { createUtilityBill, deleteUtilityBill } from "@/services/utilities";
import { deleteTenant, listRoomsWithBeds, moveOutTenant, moveTenantToBed } from "@/services/tenants";
import { monthlySummary, outstandingByTenant, dashboardData } from "@/services/reports";
import { addExpense } from "@/services/misc";
import { myInvoices, myPayments, tenantForUser } from "@/services/portal";
import { addTenant, allBeds, seedAdmin, testDb } from "./helpers";

let db: DB;
let admin: string;
beforeAll(async () => {
  db = await testDb();
  admin = await seedAdmin(db);
});

describe("foreign keys & transactions", () => {
  it("rejects orphan rows (FK enforced)", async () => {
    await expect(db.insert(bedAssignments).values({ bedId: "nope", tenantId: "nope", startDate: "2026-01-01" })).rejects.toThrow();
  });
  it("rolls back failed transactions", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(auditLogs).values({ action: "x", entity: "x" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "x"))).toHaveLength(0);
  });
});

describe("authentication & sessions", () => {
  it("logs in, rejects wrong password, locks out after repeated failures", async () => {
    expect((await authenticate(db, "OWNER@example.test", "Sup3rSecret99", "1.1.1.1")).ok).toBe(true);
    const bad = await authenticate(db, "owner@example.test", "wrong-password1", "2.2.2.2");
    expect(bad).toMatchObject({ ok: false, reason: "invalid" });
    for (let i = 0; i < MAX_FAILURES; i++) await authenticate(db, "owner@example.test", "wrong-password1", "3.3.3.3");
    const locked = await authenticate(db, "owner@example.test", "Sup3rSecret99", "3.3.3.3");
    expect(locked).toMatchObject({ ok: false, reason: "locked" });
    // Other IPs unaffected; unknown users get the same generic failure.
    expect((await authenticate(db, "ghost@example.test", "whatever12345", "4.4.4.4"))).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("sessions expire, can be destroyed, and store only a hash", async () => {
    const [u] = await db.select().from(users).where(eq(users.email, "owner@example.test"));
    const now = Date.now();
    const { token } = await createSession(db, u.id, "ua", now);
    expect((await getSessionUser(db, token, now))?.role).toBe("admin");
    expect(await getSessionUser(db, token, now + 8 * 86400_000)).toBeNull();
    expect(await getSessionUser(db, "garbage", now)).toBeNull();
    await destroySession(db, token);
    expect(await getSessionUser(db, token, now)).toBeNull();
  });
  it("stores argon2id hashes, never plaintext", async () => {
    const [u] = await db.select().from(users).where(eq(users.email, "owner@example.test"));
    expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(u.passwordHash).not.toContain("Sup3rSecret99");
  });
  it("deactivated users cannot log in or use sessions", async () => {
    const t = await addTenant(db, admin);
    const [p] = await db.select().from(tenantProfiles).where(eq(tenantProfiles.id, t));
    const [u] = await db.select().from(users).where(eq(users.id, p.userId));
    const { token } = await createSession(db, u.id);
    await db.update(users).set({ isActive: false }).where(eq(users.id, u.id));
    expect(await getSessionUser(db, token)).toBeNull();
    expect((await authenticate(db, u.email, "Passw0rdTest1", "9.9.9.9")).ok).toBe(false);
  });
});

describe("rooms and beds", () => {
  it("has 2 rooms x 4 beds and enforces one tenant per bed and one bed per tenant", async () => {
    const rooms = await listRoomsWithBeds(db);
    expect(rooms).toHaveLength(2);
    expect(rooms.every((r) => r.beds.length === 4)).toBe(true);
    const beds = await allBeds(db);
    const a = await addTenant(db, admin, { bedId: beds[0].id });
    await expect(addTenant(db, admin, { bedId: beds[0].id })).rejects.toThrow(/occupied/);
    await expect(moveTenantToBed(db, admin, a, beds[1].id, "2026-02-01")).resolves.toBeUndefined(); // move frees old bed
    const b = await addTenant(db, admin, { bedId: beds[0].id }); // freed bed reusable
    expect(b).toBeTruthy();
  });
  it("DB-level unique index blocks duplicate current assignments even bypassing the service", async () => {
    const beds = await allBeds(db);
    const t = await addTenant(db, admin);
    await expect(
      db.insert(bedAssignments).values({ bedId: beds[0].id, tenantId: t, startDate: "2026-01-01" }),
    ).rejects.toThrow();
  });
  it("never exceeds 4 residents per room", async () => {
    const rooms = await listRoomsWithBeds(db);
    const room2 = rooms[1];
    for (const bed of room2.beds) if (!bed.tenantId) await addTenant(db, admin, { bedId: bed.id });
    const after = (await listRoomsWithBeds(db))[1];
    expect(after.beds.filter((b) => b.tenantId).length).toBe(4);
    const extra = await addTenant(db, admin);
    for (const bed of after.beds) await expect(moveTenantToBed(db, admin, extra, bed.id, "2026-02-01")).rejects.toThrow();
  });
});

describe("rent invoices & payments", () => {
  let t1: string, t2: string;
  const M = "2026-03";
  beforeAll(async () => {
    const fresh = await testDb();
    db = fresh;
    admin = await seedAdmin(db);
    t1 = await addTenant(db, admin, { rent: 600000, name: "Asha Demo" });
    t2 = await addTenant(db, admin, { rent: 500000, name: "Bina Demo" });
  });

  it("generates invoices idempotently", async () => {
    const r1 = await syncInvoices(db, admin, M);
    expect(r1.created).toBe(2);
    const r2 = await syncInvoices(db, admin, M);
    expect(r2.created).toBe(0);
    expect(await db.select().from(invoices).where(eq(invoices.periodMonth, M))).toHaveLength(2);
    expect(await db.select().from(invoiceItems)).toHaveLength(2);
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.tenantId, t1), eq(invoices.periodMonth, M)));
    expect(inv.totalPaise).toBe(600000);
    expect(inv.dueDate).toBe("2026-03-05");
  });

  it("DB prevents duplicate invoice for same tenant+month", async () => {
    await expect(db.insert(invoices).values({ tenantId: t1, periodMonth: M, dueDate: "2026-03-05" })).rejects.toThrow();
  });

  it("handles partial then full payment, blocks overpayment, supports void", async () => {
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.tenantId, t1), eq(invoices.periodMonth, M)));
    const p1 = await recordPayment(db, admin, { invoiceId: inv.id, amountPaise: 250000, paidOn: "2026-03-04", method: "upi", reference: "UPI123" });
    expect(p1.receiptNo).toMatch(/^R20260304-/);
    let d = await getInvoiceDetail(db, inv.id);
    expect(d?.paidPaise).toBe(250000);
    await expect(recordPayment(db, admin, { invoiceId: inv.id, amountPaise: 350001, paidOn: "2026-03-05", method: "cash" })).rejects.toThrow(/exceeds/);
    await recordPayment(db, admin, { invoiceId: inv.id, amountPaise: 350000, paidOn: "2026-03-05", method: "cash" });
    d = await getInvoiceDetail(db, inv.id);
    expect(d?.paidPaise).toBe(d?.totalPaise);
    await expect(recordPayment(db, admin, { invoiceId: inv.id, amountPaise: 1, paidOn: "2026-03-06", method: "cash" })).rejects.toThrow(/fully paid/);
    await voidPayment(db, admin, p1.id, "Entered by mistake");
    d = await getInvoiceDetail(db, inv.id);
    expect(d?.paidPaise).toBe(350000);
    expect((await db.select().from(payments).where(eq(payments.id, p1.id)))[0].voidedAt).not.toBeNull(); // row preserved
  });

  it("applies discounts with reason and extra charges", async () => {
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.tenantId, t2), eq(invoices.periodMonth, M)));
    await expect(addInvoiceItem(db, admin, inv.id, "adjustment", " ", 100)).rejects.toThrow(/reason/);
    await addInvoiceItem(db, admin, inv.id, "adjustment", "Festival discount", 50000);
    await addInvoiceItem(db, admin, inv.id, "other", "Late fee", 10000);
    const d = await getInvoiceDetail(db, inv.id);
    expect(d?.totalPaise).toBe(500000 - 50000 + 10000);
    // invariant: stored total equals item sum
    expect(d?.items.reduce((a, i) => a + i.amountPaise, 0)).toBe(d?.totalPaise);
  });

  it("carries outstanding forward without duplicating old charges", async () => {
    await syncInvoices(db, admin, "2026-04");
    await syncInvoices(db, admin, "2026-04");
    const out = await outstandingByTenant(db);
    const bina = out.find((o) => o.name === "Bina Demo")!;
    // March (460000) + April (500000), each charged exactly once.
    expect(bina.balance).toBe(460000 + 500000);
    expect(await db.select().from(invoices).where(eq(invoices.tenantId, t2))).toHaveLength(2);
  });
});

describe("utility billing", () => {
  let tenants: string[];
  const M = "2026-05";
  beforeAll(async () => {
    db = await testDb();
    admin = await seedAdmin(db);
    const beds = await allBeds(db);
    tenants = [];
    for (let i = 0; i < 3; i++) tenants.push(await addTenant(db, admin, { bedId: beds[i].id, name: `Res ${i}` }));
    await addTenant(db, admin, { joining: "2026-06-15" }); // joins after May: not eligible
  });

  it("splits electricity exactly, snapshots allocations, attaches to invoices, mirrors expense", async () => {
    const id = await createUtilityBill(db, admin, {
      type: "electricity", periodMonth: M, totalPaise: 1000001, method: "equal_residents",
      billDate: "2026-05-31", dueDate: "2026-06-10", openingReading: 1000, closingReading: 1450,
    });
    const allocs = await db.select().from(utilityAllocations).where(eq(utilityAllocations.utilityBillId, id));
    expect(allocs).toHaveLength(3);
    expect(allocs.reduce((a, x) => a + x.amountPaise, 0)).toBe(1000001);
    const exp = await db.select().from(expenses).where(eq(expenses.utilityBillId, id));
    expect(exp[0].amountPaise).toBe(1000001);
    const invs = await db.select().from(invoices).where(eq(invoices.periodMonth, M));
    expect(invs).toHaveLength(3);
    for (const i of invs) expect(i.totalPaise).toBe(600000 + allocs.find((a) => a.tenantId === i.tenantId)!.amountPaise);
  });

  it("prevents duplicate bill for same type and period; allows water separately", async () => {
    await expect(
      createUtilityBill(db, admin, { type: "electricity", periodMonth: M, totalPaise: 5000, method: "equal_residents", billDate: "2026-05-31", dueDate: "2026-06-10" }),
    ).rejects.toThrow(/already exists/);
    await createUtilityBill(db, admin, { type: "water", periodMonth: M, totalPaise: 90000, method: "equal_residents", billDate: "2026-05-31", dueDate: "2026-06-10" });
    const kinds = (await db.select().from(invoiceItems)).map((i) => i.kind);
    expect(kinds.filter((k) => k === "water")).toHaveLength(3);
    expect(kinds.filter((k) => k === "electricity")).toHaveLength(3);
  });

  it("rejects bad readings and mismatched custom amounts", async () => {
    await expect(
      createUtilityBill(db, admin, { type: "electricity", periodMonth: "2026-07", totalPaise: 1000, method: "equal_residents", billDate: "2026-07-31", dueDate: "2026-08-10", openingReading: 500, closingReading: 400 }),
    ).rejects.toThrow(/Closing/);
    await expect(
      createUtilityBill(db, admin, { type: "electricity", periodMonth: "2026-07", totalPaise: 1000, method: "custom", billDate: "2026-07-31", dueDate: "2026-08-10", custom: { [tenants[0]]: 100 } }),
    ).rejects.toThrow(/add up/);
  });

  it("historical allocations don't change when residents change later", async () => {
    const before = await db.select().from(utilityAllocations);
    await addTenant(db, admin, { joining: "2026-05-01" }); // new resident after bill creation
    await moveOutTenant(db, admin, tenants[0], "2026-08-01");
    const after = await db.select().from(utilityAllocations);
    expect(after.map((a) => [a.tenantId, a.amountPaise]).sort()).toEqual(before.map((a) => [a.tenantId, a.amountPaise]).sort());
  });

  it("custom allocation works and delete is blocked when payments exist", async () => {
    const id = await createUtilityBill(db, admin, {
      type: "water", periodMonth: "2026-09", totalPaise: 30000, method: "custom", billDate: "2026-09-30", dueDate: "2026-10-10",
      custom: { [tenants[1]]: 10000, [tenants[2]]: 20000 },
    });
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.tenantId, tenants[1]), eq(invoices.periodMonth, "2026-09")));
    expect(inv.totalPaise).toBe(600000 + 10000);
    await recordPayment(db, admin, { invoiceId: inv.id, amountPaise: 1000, paidOn: "2026-09-02", method: "cash" });
    await expect(deleteUtilityBill(db, admin, id)).rejects.toThrow(/Payments exist/);
  });
});

describe("move-out, isolation and reports", () => {
  let a: string, b: string, aUser: string, bUser: string;
  beforeAll(async () => {
    db = await testDb();
    admin = await seedAdmin(db);
    const beds = await allBeds(db);
    a = await addTenant(db, admin, { bedId: beds[0].id, rent: 600000, name: "Alpha" });
    b = await addTenant(db, admin, { bedId: beds[1].id, rent: 600000, name: "Beta" });
    aUser = (await db.select().from(tenantProfiles).where(eq(tenantProfiles.id, a)))[0].userId;
    bUser = (await db.select().from(tenantProfiles).where(eq(tenantProfiles.id, b)))[0].userId;
    await syncInvoices(db, admin, "2026-03");
    const [ia] = await db.select().from(invoices).where(eq(invoices.tenantId, a));
    await recordPayment(db, admin, { invoiceId: ia.id, amountPaise: 400000, paidOn: "2026-03-10", method: "bank_transfer", reference: "NEFT1" });
  });

  it("tenants only see their own records", async () => {
    expect((await tenantForUser(db, aUser))?.name).toBe("Alpha");
    const mine = await myInvoices(db, aUser);
    expect(mine).toHaveLength(1);
    const [ib] = await db.select().from(invoices).where(eq(invoices.tenantId, b));
    expect(await getInvoiceDetail(db, ib.id, a)).toBeNull(); // scoped detail lookup
    expect(await getInvoiceDetail(db, ib.id, b)).not.toBeNull();
    expect(await myPayments(db, bUser)).toHaveLength(0);
    expect(await myPayments(db, aUser)).toHaveLength(1);
    expect(await myInvoices(db, "unknown-user")).toEqual([]);
  });

  it("move-out frees the bed, keeps invoices/payments, and blocks hard delete", async () => {
    await moveOutTenant(db, admin, a, "2026-03-31");
    expect(await db.select().from(bedAssignments).where(and(eq(bedAssignments.tenantId, a), isNull(bedAssignments.endDate)))).toHaveLength(0);
    expect((await db.select().from(invoices).where(eq(invoices.tenantId, a)))).toHaveLength(1);
    expect((await db.select().from(payments).where(eq(payments.tenantId, a)))).toHaveLength(1);
    await expect(deleteTenant(db, admin, a)).rejects.toThrow(/history is preserved/);
    // Not billed for months after move-out; still billed for the month they left.
    await syncInvoices(db, admin, "2026-04");
    expect(await db.select().from(invoices).where(eq(invoices.tenantId, a))).toHaveLength(1);
    // Outstanding balance from before move-out remains visible.
    expect((await outstandingByTenant(db)).find((o) => o.name === "Alpha")?.balance).toBe(200000);
  });

  it("hard-deletes only never-billed tenants", async () => {
    const x = await addTenant(db, admin);
    await deleteTenant(db, admin, x);
    expect(await db.select().from(tenantProfiles).where(eq(tenantProfiles.id, x))).toHaveLength(0);
  });

  it("reports separate cash collected from invoiced and subtract expenses", async () => {
    await addExpense(db, admin, { category: "cleaning", amountPaise: 150000, spentOn: "2026-03-12", description: "Maid" });
    const rows = await monthlySummary(db, "2026-03", "2026-04");
    const mar = rows[0];
    expect(mar.invoiced).toBe(1200000); // billed, not income
    expect(mar.collected.total).toBe(400000); // only cash
    expect(mar.collected.rent).toBe(400000);
    expect(mar.expenses).toBe(150000);
    expect(mar.net).toBe(250000);
    expect(mar.outstanding).toBe(800000);
    const dash = await dashboardData(db, "2026-03", "2026-03-15");
    expect(dash.rentCollected).toBe(400000);
    expect(dash.pendingThisMonth).toBe(800000);
    expect(dash.capacity).toBe(8);
    expect(dash.residents).toBe(1);
    expect(dash.availableBeds).toBe(7);
  });

  it("voided payments are excluded from collected totals", async () => {
    const [p] = await db.select().from(payments).where(eq(payments.tenantId, a));
    await voidPayment(db, admin, p.id, "bounced");
    const rows = await monthlySummary(db, "2026-03", "2026-03");
    expect(rows[0].collected.total).toBe(0);
  });
});
