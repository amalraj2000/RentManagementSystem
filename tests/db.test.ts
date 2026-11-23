import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLogs, bedAssignments, expenses, invoiceItems, invoices, payments, tenantProfiles, users, utilityAllocations } from "@/db/schema";
import { authenticate, createSession, getSessionUser, destroySession, MAX_FAILURES } from "@/lib/auth-core";
import { addInvoiceItem, getInvoiceDetail, recordPayment, syncInvoices, voidPayment } from "@/services/billing";
import { createUtilityBill, deleteUtilityBill } from "@/services/utilities";
import { createTenant, deleteTenant, listRoomsWithBeds, vacateTenant, moveTenantToBed } from "@/services/tenants";
import { monthlySummary, outstandingByTenant, dashboardData } from "@/services/reports";
import { addExpense } from "@/services/misc";
import { myInvoices, myPayments, mySharedExpenses, tenantForUser } from "@/services/portal";
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
    await vacateTenant(db, admin, tenants[0], "2026-08-01");
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
    await recordPayment(db, admin, { invoiceId: inv.id, amountPaise: 1000, paidOn: "2026-09-02", method: "cash" }); // a RENT payment
    await recordPayment(db, admin, { invoiceId: inv.id, purpose: "expense", amountPaise: 1000, paidOn: "2026-09-02", method: "cash" });
    await expect(deleteUtilityBill(db, admin, id)).rejects.toThrow(/Expense payments exist/);
  });
});

describe("vacate, isolation and reports", () => {
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

  it("vacate frees the bed, keeps invoices/payments, and blocks hard delete", async () => {
    await vacateTenant(db, admin, a, "2026-03-31");
    expect(await db.select().from(bedAssignments).where(and(eq(bedAssignments.tenantId, a), isNull(bedAssignments.endDate)))).toHaveLength(0);
    expect((await db.select().from(invoices).where(eq(invoices.tenantId, a)))).toHaveLength(1);
    expect((await db.select().from(payments).where(eq(payments.tenantId, a)))).toHaveLength(1);
    await expect(deleteTenant(db, admin, a)).rejects.toThrow(/history is preserved/);
    // Not billed for months after vacate; still billed for the month they left.
    await syncInvoices(db, admin, "2026-04");
    expect(await db.select().from(invoices).where(eq(invoices.tenantId, a))).toHaveLength(1);
    // Outstanding balance from before vacate remains visible.
    expect((await outstandingByTenant(db)).find((o) => o.name === "Alpha")?.balance).toBe(200000);
  });

  it("hard-deletes only never-billed tenants", async () => {
    const x = await addTenant(db, admin);
    await deleteTenant(db, admin, x);
    expect(await db.select().from(tenantProfiles).where(eq(tenantProfiles.id, x))).toHaveLength(0);
  });

  it("reports separate cash collected from invoiced and subtract expenses", async () => {
    await addExpense(db, admin, { category: "water", amountPaise: 150000, spentOn: "2026-03-12", description: "Maid" });
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

describe("admin management", () => {
  it("creates admins, protects against lock-out, and revokes access on disable/reset", async () => {
    const { createAdminUser, setAdminActive, resetAdminPassword, listAdmins } = await import("@/services/admins");
    const d = await testDb();
    const first = await seedAdmin(d);
    await createAdminUser(d, first, { name: "Second Admin", email: "Second@Example.test", password: "SecondPass123" });
    await expect(createAdminUser(d, first, { name: "Dup", email: "second@example.test", password: "SecondPass123" })).rejects.toThrow(/already exists/);
    await expect(createAdminUser(d, first, { name: "Weak", email: "w@example.test", password: "short" })).rejects.toThrow();
    const admins = await listAdmins(d);
    expect(admins).toHaveLength(2);
    const second = admins.find((a) => a.email === "second@example.test")!;
    expect((await authenticate(d, "second@example.test", "SecondPass123", "7.7.7.7")).ok).toBe(true);
    const { token } = await createSession(d, second.id);
    await expect(setAdminActive(d, first, first, false)).rejects.toThrow(/own account/);
    await setAdminActive(d, first, second.id, false);
    expect(await getSessionUser(d, token)).toBeNull();
    expect((await authenticate(d, "second@example.test", "SecondPass123", "7.7.7.8")).ok).toBe(false);
    // second is disabled, so `first` is the only active admin: a self-targeted or last-admin disable is blocked
    await expect(setAdminActive(d, second.id, first, false)).rejects.toThrow(/At least one/);
    await setAdminActive(d, first, second.id, true);
    await expect(resetAdminPassword(d, first, first, "AnotherPass123")).rejects.toThrow(/My profile/);
    await resetAdminPassword(d, first, second.id, "ResetPass12345");
    expect((await authenticate(d, "second@example.test", "ResetPass12345", "7.7.7.9")).ok).toBe(true);
  });
});

describe("edit & delete rules", () => {
  it("edits expenses/notices/payments/utility meta and guards deletes", async () => {
    const d = await testDb();
    const adm = await seedAdmin(d);
    const { addExpense, updateExpense, postAnnouncement, updateAnnouncement, listAnnouncements } = await import("@/services/misc");
    const { updatePaymentDetails, deleteInvoice } = await import("@/services/billing");
    const { updateUtilityDetails } = await import("@/services/utilities");
    const { updateAdminUser, deleteAdminUser, createAdminUser, listAdmins } = await import("@/services/admins");

    await addExpense(d, adm, { category: "water", amountPaise: 1000, spentOn: "2026-03-01", description: "Maid" });
    const [ex] = await d.select().from(expenses);
    await updateExpense(d, adm, ex.id, { category: "electricity", amountPaise: 2500, spentOn: "2026-03-02", description: "Tap" });
    expect((await d.select().from(expenses).where(eq(expenses.id, ex.id)))[0]).toMatchObject({ category: "electricity", amountPaise: 2500 });

    await postAnnouncement(d, adm, { title: "A", body: "B", pinned: false });
    const [an] = await listAnnouncements(d);
    await updateAnnouncement(d, adm, an.id, { title: "A2", body: "B2", pinned: true });
    expect((await listAnnouncements(d))[0]).toMatchObject({ title: "A2", pinned: true });

    const beds = await allBeds(d);
    const t1 = await addTenant(d, adm, { bedId: beds[0].id });
    const t2 = await addTenant(d, adm, { bedId: beds[1].id });
    await createUtilityBill(d, adm, { type: "electricity", periodMonth: "2026-03", totalPaise: 100000, method: "equal_residents", billDate: "2026-03-31", dueDate: "2026-04-10" });
    const [bill] = await d.select().from((await import("@/db/schema")).utilityBills);
    await expect(updateUtilityDetails(d, adm, bill.id, { billDate: "2026-03-30", dueDate: "2026-04-12", openingReading: 500, closingReading: 100 })).rejects.toThrow(/Closing/);
    await updateUtilityDetails(d, adm, bill.id, { billDate: "2026-03-30", dueDate: "2026-04-12", openingReading: 100, closingReading: 400, notes: "ok" });
    const after = (await d.select().from((await import("@/db/schema")).utilityBills))[0];
    expect(after).toMatchObject({ unitsConsumed: 300, totalPaise: 100000 }); // total untouched
    expect((await d.select().from(expenses).where(eq(expenses.utilityBillId, bill.id)))[0].spentOn).toBe("2026-03-30");
    await expect(updateExpense(d, adm, (await d.select().from(expenses).where(eq(expenses.utilityBillId, bill.id)))[0].id, { category: "cooking_gas", amountPaise: 1, spentOn: "2026-03-01", description: "x" })).rejects.toThrow(/utility bill/);

    const [inv1] = await d.select().from(invoices).where(eq(invoices.tenantId, t1));
    const [inv2] = await d.select().from(invoices).where(eq(invoices.tenantId, t2));
    const pay = await recordPayment(d, adm, { invoiceId: inv1.id, amountPaise: 1000, paidOn: "2026-03-05", method: "cash" });
    await updatePaymentDetails(d, adm, pay.id, { paidOn: "2026-03-06", method: "upi", reference: "R1" });
    const [pp] = await d.select().from(payments).where(eq(payments.id, pay.id));
    expect(pp).toMatchObject({ paidOn: "2026-03-06", method: "upi", amountPaise: 1000 });
    await expect(deleteInvoice(d, adm, inv1.id)).rejects.toThrow(/has payments/);
    await deleteInvoice(d, adm, inv2.id); // no payments -> allowed
    expect(await d.select().from(invoices).where(eq(invoices.id, inv2.id))).toHaveLength(0);
    expect(await d.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv2.id))).toHaveLength(0);
    await syncInvoices(d, adm, "2026-03"); // regenerates cleanly, utility share re-attached
    const [re] = await d.select().from(invoices).where(eq(invoices.tenantId, t2));
    expect(re.totalPaise).toBe(600000 + 50000);

    await createAdminUser(d, adm, { name: "Two", email: "two@example.test", password: "TwoPassword123" });
    const two = (await listAdmins(d)).find((a) => a.email === "two@example.test")!;
    await updateAdminUser(d, adm, two.id, { name: "Two Renamed", email: "two2@example.test" });
    await expect(updateAdminUser(d, adm, two.id, { name: "x", email: "owner@example.test" })).rejects.toThrow(/already exists/);
    await expect(deleteAdminUser(d, adm, adm)).rejects.toThrow(/own account/);
    await deleteAdminUser(d, adm, two.id);
    expect(await listAdmins(d)).toHaveLength(1);
    // admin who recorded a payment can't be hard-deleted
    await createAdminUser(d, adm, { name: "Three", email: "three@example.test", password: "ThreePassword123" });
    const three = (await listAdmins(d)).find((a) => a.email === "three@example.test")!;
    await recordPayment(d, three.id, { invoiceId: re.id, amountPaise: 100, paidOn: "2026-03-07", method: "cash" });
    await expect(deleteAdminUser(d, adm, three.id)).rejects.toThrow(/Disable them instead/);
  });
});

describe("room setup", () => {
  it("adds, renames, resizes and deletes rooms with safeguards", async () => {
    const { createRoom, updateRoom, deleteRoom, roomSummaries } = await import("@/services/rooms");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const id = await createRoom(d, adm, { name: "Guest Room", bedCount: 2, hasAttachedBathroom: false });
    expect((await roomSummaries(d)).find((r) => r.id === id)).toMatchObject({ beds: 2, capacity: 2, occupied: 0, bathroom: false });
    await expect(createRoom(d, adm, { name: "Guest Room", bedCount: 1, hasAttachedBathroom: true })).rejects.toThrow(/already exists/);
    await expect(createRoom(d, adm, { name: "X", bedCount: 5, hasAttachedBathroom: true })).rejects.toThrow(/1 to 4/);
    // rename + grow
    await updateRoom(d, adm, id, { name: "Bedroom 3", bedCount: 4, hasAttachedBathroom: true });
    expect((await roomSummaries(d)).find((r) => r.id === id)).toMatchObject({ name: "Bedroom 3", beds: 4, capacity: 4, bathroom: true });
    await expect(updateRoom(d, adm, id, { name: "Bedroom 1", bedCount: 4, hasAttachedBathroom: true })).rejects.toThrow(/already exists/); // name taken by seeded room
    // occupy bed 4 -> can't shrink below it, but vacant ones can go
    const room = (await listRoomsWithBeds(d)).find((r) => r.id === id)!;
    const t = await addTenant(d, adm, { bedId: room.beds[3].id });
    await expect(updateRoom(d, adm, id, { name: "Bedroom 3", bedCount: 2, hasAttachedBathroom: true })).rejects.toThrow(/Bed 4/);
    await moveTenantToBed(d, adm, t, room.beds[0].id, "2026-02-01");
    await expect(updateRoom(d, adm, id, { name: "Bedroom 3", bedCount: 2, hasAttachedBathroom: true })).rejects.toThrow(/Bed 4/); // bed 4 has history
    await updateRoom(d, adm, id, { name: "Bedroom 3", bedCount: 4, hasAttachedBathroom: true });
    // room with history can't be deleted; a fresh room can
    await expect(deleteRoom(d, adm, id)).rejects.toThrow(/still lives/); // somebody is in it now
    await vacateTenant(d, adm, t, "2026-03-01");
    expect(await deleteRoom(d, adm, id)).toEqual({ archived: true }); // had tenants before -> hidden, history kept
    expect((await roomSummaries(d)).some((r) => r.id === id)).toBe(false);
    expect((await listRoomsWithBeds(d)).some((r) => r.id === id)).toBe(false);
    expect((await d.select().from(bedAssignments).where(eq(bedAssignments.tenantId, t))).length).toBeGreaterThan(0); // history intact
    await expect(deleteRoom(d, adm, id)).rejects.toThrow(/not found/);
    await createRoom(d, adm, { name: "Bedroom 3", bedCount: 1, hasAttachedBathroom: true }); // the name is free again
    await deleteRoom(d, adm, (await roomSummaries(d)).find((r) => r.name === "Bedroom 3")!.id);
    const fresh = await createRoom(d, adm, { name: "Temp", bedCount: 1, hasAttachedBathroom: false });
    await deleteRoom(d, adm, fresh);
    expect((await roomSummaries(d)).some((r) => r.id === fresh)).toBe(false);
    // shrinking a never-used room works and capacity follows (dashboard capacity = sum)
    const other = await createRoom(d, adm, { name: "Spare", bedCount: 4, hasAttachedBathroom: true });
    await updateRoom(d, adm, other, { name: "Spare", bedCount: 2, hasAttachedBathroom: true });
    expect((await roomSummaries(d)).find((r) => r.id === other)).toMatchObject({ beds: 2, capacity: 2 });
    expect((await dashboardData(d, "2026-03", "2026-03-15")).capacity).toBe(4 + 4 + 2); // archived room no longer counts
  });
});

describe("tenant documents", () => {
  const png = () => new File([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)])], "me.png", { type: "image/png" });
  const pdf = () => new File([Buffer.from("%PDF-1.4\n" + "x".repeat(50))], "aadhaar.pdf", { type: "application/pdf" });

  it("validates by real content, enforces limits, replaces photo, and isolates access", async () => {
    const { uploadDocument, validateFile, listDocuments, getDocumentForUser, deleteDocument, MAX_ID_PROOFS } = await import("@/services/documents");
    const { tenantDocuments } = await import("@/db/schema");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const a = await addTenant(d, adm, { name: "Doc A" });
    const b = await addTenant(d, adm, { name: "Doc B" });
    const userOf = async (t: string) => (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, t)))[0].userId;

    // content sniffing: a script renamed .png is rejected; a PDF can't be a photo; empty/oversize rejected
    await expect(validateFile(new File(["<script>alert(1)</script>"], "x.png", { type: "image/png" }), "photo")).rejects.toThrow(/Unsupported/);
    await expect(validateFile(pdf(), "photo")).rejects.toThrow(/must be an image/);
    await expect(validateFile(new File([], "e.png"), "photo")).rejects.toThrow(/empty/);
    await expect(validateFile(new File([Buffer.alloc(1.6 * 1024 * 1024, 1)], "big.png"), "photo")).rejects.toThrow(/too large/);
    expect((await validateFile(new File([Buffer.from("%PDF-1.4 x")], "../../evil name!.pdf"), "id_proof")).fileName).not.toMatch(/[\/!]/);

    // one photo per tenant: second upload replaces the first
    await uploadDocument(d, adm, a, "photo", png());
    await uploadDocument(d, adm, a, "photo", png());
    expect((await listDocuments(d, a)).filter((x) => x.kind === "photo")).toHaveLength(1);

    // ID proofs capped
    for (let i = 0; i < MAX_ID_PROOFS; i++) await uploadDocument(d, adm, a, "id_proof", pdf(), "aadhaar");
    await expect(uploadDocument(d, adm, a, "id_proof", pdf())).rejects.toThrow(/up to 4/);
    await uploadDocument(d, adm, b, "id_proof", pdf(), "pan");

    // access control: admin any, owner own, other tenant none
    const [docA] = await listDocuments(d, a);
    const [docB] = await listDocuments(d, b);
    expect((await getDocumentForUser(d, docA.id, { id: adm, role: "admin" }))?.mimeType).toMatch(/image|pdf/);
    expect(await getDocumentForUser(d, docA.id, { id: await userOf(a), role: "tenant" })).not.toBeNull();
    expect(await getDocumentForUser(d, docA.id, { id: await userOf(b), role: "tenant" })).toBeNull();
    expect(await getDocumentForUser(d, docB.id, { id: await userOf(a), role: "tenant" })).toBeNull();
    expect(await getDocumentForUser(d, "nope", { id: adm, role: "admin" })).toBeNull();
    const got = await getDocumentForUser(d, docA.id, { id: adm, role: "admin" });
    expect(Buffer.isBuffer(got!.data) && got!.data.length > 0).toBe(true);

    // audit + delete + cascade with tenant removal
    await deleteDocument(d, adm, docB.id);
    expect(await listDocuments(d, b)).toHaveLength(0);
    await deleteTenant(d, adm, b); // never billed -> allowed
    await deleteTenant(d, adm, a);
    expect(await d.select().from(tenantDocuments)).toHaveLength(0); // cascaded, no orphan files
  });

  it("creates a tenant with photo + ID atomically", async () => {
    const { validateFile, listDocuments } = await import("@/services/documents");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const photo = await validateFile(png(), "photo");
    const idProof = { file: await validateFile(pdf(), "id_proof"), idType: "passport" };
    const t = await createTenant(d, adm, { name: "With Docs", email: "wd@example.test", phone: "9000000000", joiningDate: "2026-01-01", monthlyRentPaise: 1, securityDepositPaise: 0, password: "Passw0rdTest1", photo, idProof });
    const docs = await listDocuments(d, t);
    expect(docs.map((x) => x.kind).sort()).toEqual(["id_proof", "photo"]);
    expect(docs.find((x) => x.kind === "id_proof")?.idType).toBe("passport");
  });
});

describe("expense receipt image", () => {
  it("is optional, replaceable, removable, validated, and removed with the expense", async () => {
    const { addExpense, updateExpense, deleteExpense, getReceiptImage, receiptInfo } = await import("@/services/misc");
    const { validateFile } = await import("@/services/documents");
    const { expenseReceipts } = await import("@/db/schema");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const png = (n: number) => new File([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, 7)])], `r${n}.png`, { type: "image/png" });
    const base = { category: "electricity" as const, amountPaise: 5000, spentOn: "2026-03-01", description: "Tap" };

    const plain = await addExpense(d, adm, base); // no image: fine
    expect(await getReceiptImage(d, plain)).toBeNull();

    await expect(validateFile(new File(["%PDF-1.4 x"], "r.pdf"), "photo", "receipt")).rejects.toMatchObject({ field: "receipt" }); // images only
    const withImg = await addExpense(d, adm, { ...base, receipt: await validateFile(png(50), "photo", "receipt") });
    expect((await receiptInfo(d, withImg))?.fileName).toBe("r50.png");

    const exp = (await d.select().from((await import("@/db/schema")).expenses).where(eq((await import("@/db/schema")).expenses.id, withImg)))[0];
    await updateExpense(d, adm, withImg, { category: exp.category, amountPaise: 6000, spentOn: exp.spentOn, description: exp.description, receipt: await validateFile(png(80), "photo", "receipt") });
    expect((await receiptInfo(d, withImg))?.fileName).toBe("r80.png"); // replaced, still one row
    expect(await d.select().from(expenseReceipts)).toHaveLength(1);
    await updateExpense(d, adm, withImg, { category: exp.category, amountPaise: 6000, spentOn: exp.spentOn, description: exp.description }); // untouched
    expect(await receiptInfo(d, withImg)).not.toBeNull();
    await updateExpense(d, adm, withImg, { category: exp.category, amountPaise: 6000, spentOn: exp.spentOn, description: exp.description, removeReceipt: true });
    expect(await receiptInfo(d, withImg)).toBeNull();

    const again = await addExpense(d, adm, { ...base, receipt: await validateFile(png(10), "photo", "receipt") });
    await deleteExpense(d, adm, again);
    expect(await d.select().from(expenseReceipts)).toHaveLength(0); // cascade, no orphan bytes
  });
});

describe("shared expenses", () => {
  it("splits equally / custom among active tenants, bills them, and guards edits", async () => {
    const { addExpense, updateExpense, deleteExpense } = await import("@/services/misc");
    const { expenseAllocations } = await import("@/db/schema");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const beds = await allBeds(d);
    const t = [] as string[];
    for (let i = 0; i < 3; i++) t.push(await addTenant(d, adm, { bedId: beds[i].id, name: `Sh ${i}`, rent: 100000 }));
    const late = await addTenant(d, adm, { joining: "2026-09-01", name: "Late joiner" }); // not active in March
    const left = await addTenant(d, adm, { joining: "2026-01-01", name: "Left early" });
    await vacateTenant(d, adm, left, "2026-02-10"); // vacated before March
    const base = { category: "water" as const, spentOn: "2026-03-10", description: "Deep clean" };

    // EQUAL: 1000.01 over 3 active tenants -> exact, remainder paise distributed
    const id = await addExpense(d, adm, { ...base, amountPaise: 100001, share: { mode: "equal" } });
    const al = await d.select().from(expenseAllocations).where(eq(expenseAllocations.expenseId, id));
    expect(al).toHaveLength(3);
    expect(al.reduce((a, x) => a + x.amountPaise, 0)).toBe(100001);
    expect(al.some((a) => a.tenantId === late || a.tenantId === left)).toBe(false);
    const invs = await d.select().from(invoices).where(eq(invoices.periodMonth, "2026-03"));
    for (const t1 of t) {
      const inv = invs.find((i) => i.tenantId === t1)!;
      const share = al.find((a) => a.tenantId === t1)!.amountPaise;
      expect(inv.totalPaise).toBe(100000 + share);
      const item = (await d.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id))).find((i) => i.expenseId === id)!;
      expect(item).toMatchObject({ kind: "other", amountPaise: share });
    }
    // dashboard/portal view for a tenant shows only their share
    const userOf = async (tid: string) => (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, tid)))[0].userId;
    const mine = await mySharedExpenses(d, await userOf(t[0]));
    expect(mine).toHaveLength(1);
    expect(mine[0].sharePaise).toBe(al.find((a) => a.tenantId === t[0])!.amountPaise);
    expect(await mySharedExpenses(d, await userOf(late))).toHaveLength(0);

    // re-running invoice generation never duplicates the shared charge
    await syncInvoices(d, adm, "2026-03");
    expect((await d.select().from(invoiceItems)).filter((i) => i.expenseId === id)).toHaveLength(3);

    // CUSTOM: different amounts, may total less than the expense; more than the expense is rejected
    const c = await addExpense(d, adm, { ...base, description: "Repairs each", category: "electricity", amountPaise: 90000, share: { mode: "custom", custom: { [t[0]]: 10000, [t[1]]: 25000 } } });
    expect((await d.select().from(expenseAllocations).where(eq(expenseAllocations.expenseId, c))).map((a) => a.amountPaise).sort((a, b) => a - b)).toEqual([10000, 25000]);
    await expect(addExpense(d, adm, { ...base, amountPaise: 1000, share: { mode: "custom", custom: { [t[0]]: 600, [t[1]]: 600 } } })).rejects.toThrow(/more than the expense/);
    await expect(addExpense(d, adm, { ...base, amountPaise: 1000, share: { mode: "custom", custom: { [late]: 500 } } })).rejects.toThrow(/not living here/);
    await expect(addExpense(d, adm, { ...base, amountPaise: 1000, share: { mode: "custom", custom: {} } })).rejects.toThrow(/at least one tenant/);
    expect((await d.select().from(expenses).where(eq(expenses.amountPaise, 1000)))).toHaveLength(0); // failed adds roll back fully

    // EDIT: change amount -> shares rebuilt, invoice totals follow, nothing double-counted
    await updateExpense(d, adm, c, { category: "electricity", amountPaise: 90000, spentOn: "2026-03-10", description: "Repairs each", share: { mode: "custom", custom: { [t[0]]: 15000, [t[2]]: 5000 } } });
    const inv0 = (await d.select().from(invoices).where(and(eq(invoices.tenantId, t[0]), eq(invoices.periodMonth, "2026-03"))))[0];
    expect(inv0.totalPaise).toBe(100000 + al.find((a) => a.tenantId === t[0])!.amountPaise + 15000);
    const inv1 = (await d.select().from(invoices).where(and(eq(invoices.tenantId, t[1]), eq(invoices.periodMonth, "2026-03"))))[0];
    expect(inv1.totalPaise).toBe(100000 + al.find((a) => a.tenantId === t[1])!.amountPaise); // t1 removed from custom share

    // payments block changing/deleting shares
    await recordPayment(d, adm, { invoiceId: inv0.id, amountPaise: 1000, paidOn: "2026-03-10", method: "cash" }); // RENT paid: must not lock the shared expense
    await updateExpense(d, adm, c, { category: "electricity", amountPaise: 90000, spentOn: "2026-03-10", description: "Repairs each", share: { mode: "custom", custom: { [t[0]]: 15000, [t[2]]: 5000 } } });
    await recordPayment(d, adm, { invoiceId: inv0.id, purpose: "expense", amountPaise: 1000, paidOn: "2026-03-11", method: "cash" }); // EXPENSES paid: now it is locked
    await expect(updateExpense(d, adm, c, { category: "electricity", amountPaise: 90000, spentOn: "2026-03-10", description: "Repairs each", share: { mode: "none" } })).rejects.toThrow(/Expense payments were already recorded/);
    await expect(deleteExpense(d, adm, c)).rejects.toThrow(/Expense payments were already recorded/);
    // unchanged edit with payments present is fine (no rebuild needed)
    await updateExpense(d, adm, c, { category: "electricity", amountPaise: 90000, spentOn: "2026-03-10", description: "Repairs each", share: { mode: "custom", custom: { [t[0]]: 15000, [t[2]]: 5000 } } });
    // not-yet-paid shared expense can be un-shared and deleted
    await updateExpense(d, adm, id, { category: "water", amountPaise: 100001, spentOn: "2026-03-10", description: "Deep clean", share: { mode: "none" } }).catch(() => null);
  });
});

describe("notifications", () => {
  it("notifies the right people for each event, never duplicates, and keeps users isolated", async () => {
    const { listNotifications, unreadCount, markRead, markAllRead, runReminders } = await import("@/services/notifications");
    const { postAnnouncement } = await import("@/services/misc");
    const { createAdminUser, listAdmins } = await import("@/services/admins");
    const { updateTenant } = await import("@/services/tenants");
    const d = await testDb();
    const adm = await seedAdmin(d);
    await createAdminUser(d, adm, { name: "Second", email: "second@example.test", password: "SecondPassword1" });
    const adm2 = (await listAdmins(d)).find((a) => a.email === "second@example.test")!.id;
    const beds = await allBeds(d);
    const a = await addTenant(d, adm, { bedId: beds[0].id, name: "Noti A", rent: 100000 });
    const b = await addTenant(d, adm, { bedId: beds[1].id, name: "Noti B", rent: 100000 });
    const uid = async (t: string) => (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, t)))[0].userId;
    const [ua, ub] = [await uid(a), await uid(b)];
    const titles = async (u: string) => (await listNotifications(d, u, 50, 0)).map((n) => n.title);

    // admin added -> the OTHER admin hears about it, the actor doesn't
    expect(await titles(adm2)).toEqual([]);
    expect((await titles(adm)).includes("New admin added")).toBe(false);

    // announcement -> every active tenant, not admins
    await postAnnouncement(d, adm, { title: "Water off", body: "Sunday 10-12", pinned: false });
    expect(await titles(ua)).toContain("New notice: Water off");
    expect(await titles(ub)).toContain("New notice: Water off");
    expect((await titles(adm)).some((t) => t.startsWith("New notice"))).toBe(false);

    // invoice generation -> each tenant gets one "bill ready"; re-running adds nothing
    await syncInvoices(d, adm, "2026-03");
    await syncInvoices(d, adm, "2026-03");
    expect((await titles(ua)).filter((t) => t.includes("bill is ready"))).toHaveLength(1);

    // payment -> tenant gets receipt notice, the other admin is told, the actor isn't
    const [inv] = await d.select().from(invoices).where(eq(invoices.tenantId, a));
    const pay = await recordPayment(d, adm, { invoiceId: inv.id, amountPaise: 40000, paidOn: "2026-03-05", method: "upi" });
    const na = (await listNotifications(d, ua, 50, 0)).find((n) => n.type === "payment_received")!;
    expect(na.body).toContain(pay.receiptNo);
    expect(na.href).toMatch(/^\/receipt\//);
    expect((await titles(adm2)).some((t) => t.startsWith("Payment recorded: Noti A"))).toBe(true);
    expect((await titles(adm)).some((t) => t.startsWith("Payment recorded"))).toBe(false);
    expect((await titles(ub)).some((t) => t.includes("Payment received"))).toBe(false); // B sees nothing of A's payment

    // void -> tenant told
    await voidPayment(d, adm, pay.id, "Entered twice");
    expect(await titles(ua)).toContain("A payment was reversed");

    // late charge on an EXISTING invoice -> "new charge" (shared expense)
    const { addExpense } = await import("@/services/misc");
    await addExpense(d, adm, { category: "water", amountPaise: 20000, spentOn: "2026-03-20", description: "Hall", share: { mode: "equal" } });
    expect(await titles(ub)).toContain("New charge on your bill");

    // notice + vacate
    await updateTenant(d, adm, a, { name: "Noti A", email: (await d.select().from(users).where(eq(users.id, ua)))[0].email, phone: "9000000000", joiningDate: "2026-01-01", monthlyRentPaise: 100000, securityDepositPaise: 0, status: "notice" });
    expect(await titles(ua)).toContain("You are on notice period");
    await vacateTenant(d, adm, b, "2026-03-31");
    expect(await titles(ub)).toContain("Your stay has ended");
    expect((await titles(adm2)).includes("A tenant has vacated")).toBe(true);

    // isolation: a user can only read/mark their own rows
    const mine = (await listNotifications(d, ua, 1, 0))[0];
    expect(await markRead(d, ub, mine.id)).toBeNull();
    expect(await unreadCount(d, ua)).toBeGreaterThan(0);
    expect(await markRead(d, ua, mine.id)).not.toBeUndefined();
    await markAllRead(d, ua);
    expect(await unreadCount(d, ua)).toBe(0);
    expect(await unreadCount(d, ub)).toBeGreaterThan(0); // B's untouched

    // reminders: due soon + overdue, once only
    const dueSoon = await d.select().from(invoices).where(eq(invoices.tenantId, a));
    expect(dueSoon[0].dueDate).toBe("2026-03-05");
    await runReminders(d, "2026-03-04"); // due tomorrow, A still owes
    expect((await titles(ua)).filter((t) => t === "Payment due soon")).toHaveLength(1);
    await runReminders(d, "2026-03-04");
    expect((await titles(ua)).filter((t) => t === "Payment due soon")).toHaveLength(1);
    await runReminders(d, "2026-03-10"); // now overdue
    await runReminders(d, "2026-03-11");
    expect((await titles(ua)).filter((t) => t === "Payment overdue")).toHaveLength(1);
    expect((await titles(adm)).filter((t) => t === "Noti A is overdue")).toHaveLength(1);
    expect((await titles(adm2)).filter((t) => t === "Noti A is overdue")).toHaveLength(1);
  });
});

describe("tenant payment reports (claims) and own photo", () => {
  const png = () => new File([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 3)])], "shot.png", { type: "image/png" });
  it("lets a tenant report a payment, only counts it once an admin approves, and isolates tenants", async () => {
    const { createClaim, approveClaim, rejectClaim, myClaims, getClaimScreenshot, adminClaims, pendingClaimCount, MAX_PENDING_CLAIMS } = await import("@/services/claims");
    const { validateFile, setOwnPhoto, removeOwnPhoto, listDocuments } = await import("@/services/documents");
    const { listNotifications } = await import("@/services/notifications");
    const { paymentClaims } = await import("@/db/schema");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const beds = await allBeds(d);
    const a = await addTenant(d, adm, { bedId: beds[0].id, name: "Claim A", rent: 100000 });
    const b = await addTenant(d, adm, { bedId: beds[1].id, name: "Claim B", rent: 100000 });
    const uid = async (t: string) => (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, t)))[0].userId;
    const [ua, ub] = [await uid(a), await uid(b)];
    await syncInvoices(d, adm, "2026-03");
    const [invA] = await d.select().from(invoices).where(eq(invoices.tenantId, a));
    const [invB] = await d.select().from(invoices).where(eq(invoices.tenantId, b));
    const base = { invoiceId: invA.id, paidOn: "2026-03-06", method: "upi" as const, reference: "UTR123" };

    // validation
    await expect(createClaim(d, ua, { ...base, amountPaise: 0 }, "2026-03-10")).rejects.toThrow(/greater than zero/);
    await expect(createClaim(d, ua, { ...base, amountPaise: 1000, paidOn: "2026-03-11" }, "2026-03-10")).rejects.toThrow(/future/);
    await expect(createClaim(d, ua, { ...base, amountPaise: 100001 }, "2026-03-10")).rejects.toThrow(/at most/);
    await expect(createClaim(d, ub, { ...base, amountPaise: 1000 }, "2026-03-10")).rejects.toThrow(/not found/); // B can't claim against A's invoice

    // a claim changes NOTHING about balances or reports until approved
    const id = await createClaim(d, ua, { ...base, amountPaise: 60000, screenshot: await validateFile(png(), "photo", "screenshot") }, "2026-03-10");
    expect((await d.select().from(invoices).where(eq(invoices.id, invA.id)))[0].paidPaise).toBe(0);
    expect(await d.select().from(payments)).toHaveLength(0);
    expect(await pendingClaimCount(d)).toBe(1);
    expect((await monthlySummary(d, "2026-03", "2026-03"))[0].collected.total).toBe(0);
    expect((await listNotifications(d, adm, 20, 0)).some((n) => n.type === "claim_submitted")).toBe(true);

    // can't double-claim past the balance while one is pending
    await expect(createClaim(d, ua, { ...base, amountPaise: 50000 }, "2026-03-10")).rejects.toThrow(/at most/);
    await createClaim(d, ua, { ...base, amountPaise: 40000 }, "2026-03-10"); // exactly the rest: allowed
    await expect(createClaim(d, ua, { ...base, amountPaise: 1 }, "2026-03-10")).rejects.toThrow(/already covers/);

    // screenshot privacy
    expect((await getClaimScreenshot(d, id, { id: ua, role: "tenant" }))?.mimeType).toBe("image/png");
    expect((await getClaimScreenshot(d, id, { id: adm, role: "admin" }))?.data.length).toBeGreaterThan(0);
    expect(await getClaimScreenshot(d, id, { id: ub, role: "tenant" })).toBeNull();
    expect(await myClaims(d, ub)).toHaveLength(0);
    expect((await myClaims(d, ua)).every((c) => !("screenshot" in c))).toBe(true); // lists never carry image bytes

    // approve -> a REAL payment (receipt, balance, reports) and the claim is linked to it
    const pay = await approveClaim(d, adm, id, 60000);
    expect(pay.receiptNo).toMatch(/^R2026/);
    expect((await d.select().from(invoices).where(eq(invoices.id, invA.id)))[0].paidPaise).toBe(60000);
    const [done] = await d.select().from(paymentClaims).where(eq(paymentClaims.id, id));
    expect(done).toMatchObject({ status: "approved", paymentId: pay.id });
    expect((await monthlySummary(d, "2026-03", "2026-03"))[0].collected.total).toBe(60000);
    await expect(approveClaim(d, adm, id)).rejects.toThrow(/already reviewed/); // no double approval
    expect((await listNotifications(d, ua, 20, 0)).some((n) => n.type === "payment_received")).toBe(true);

    // reject -> tenant told, nothing recorded; reason required
    const [second] = (await adminClaims(d, "pending", 10, 0));
    await expect(rejectClaim(d, adm, second.id, "  ")).rejects.toThrow(/reason/);
    await rejectClaim(d, adm, second.id, "No such transfer in my bank");
    expect((await listNotifications(d, ua, 20, 0)).find((n) => n.type === "claim_rejected")?.body).toContain("No such transfer");
    expect((await d.select().from(invoices).where(eq(invoices.id, invA.id)))[0].paidPaise).toBe(60000);

    // a tenant can't be flooded with pending reports
    for (let i = 0; i < MAX_PENDING_CLAIMS; i++) await createClaim(d, ub, { invoiceId: invB.id, paidOn: "2026-03-06", method: "cash", amountPaise: 100 }, "2026-03-10");
    await expect(createClaim(d, ub, { invoiceId: invB.id, paidOn: "2026-03-06", method: "cash", amountPaise: 100 }, "2026-03-10")).rejects.toThrow(/several payment reports/);

    // own photo: tenant sets/replaces/removes only THEIR photo
    await setOwnPhoto(d, ua, png());
    await setOwnPhoto(d, ua, png());
    expect((await listDocuments(d, a)).filter((x) => x.kind === "photo")).toHaveLength(1);
    expect((await listDocuments(d, b)).filter((x) => x.kind === "photo")).toHaveLength(0);
    await expect(setOwnPhoto(d, ua, new File(["%PDF-1.4 x"], "x.pdf"))).rejects.toThrow(/must be an image/);
    await removeOwnPhoto(d, ua);
    expect((await listDocuments(d, a)).filter((x) => x.kind === "photo")).toHaveLength(0);
  });
});

describe("user logs", () => {
  it("lists every user with activity, and shows what a user did vs what was done to them", async () => {
    const { listUsersWithActivity, getLoggedUser, userLogs, actionLabel, describeDetails } = await import("@/services/logs");
    const { createAdminUser, listAdmins } = await import("@/services/admins");
    const { audit } = await import("@/services/common");
    const d = await testDb();
    const adm = await seedAdmin(d);
    await createAdminUser(d, adm, { name: "Second Admin", email: "second@example.test", password: "SecondPassword1" });
    const adm2 = (await listAdmins(d)).find((a) => a.email === "second@example.test")!.id;
    const beds = await allBeds(d);
    const a = await addTenant(d, adm, { bedId: beds[0].id, name: "Log Tenant", rent: 100000 });
    const b = await addTenant(d, adm, { bedId: beds[1].id, name: "Quiet Tenant", rent: 100000 });
    const ua = (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, a)))[0].userId;
    await syncInvoices(d, adm, "2026-03");
    const [inv] = await d.select().from(invoices).where(eq(invoices.tenantId, a));
    await recordPayment(d, adm2, { invoiceId: inv.id, amountPaise: 25000, paidOn: "2026-03-05", method: "cash" }); // second admin acts
    await audit(d, ua, "auth.login", "user", ua, { ip: "1.2.3.4" });
    await authenticate(d, "second@example.test", "wrong-password-x", "9.9.9.9"); // failed login returns the account id
    const bad = await authenticate(d, "second@example.test", "wrong-password-x", "9.9.9.8");
    expect(bad).toMatchObject({ ok: false, reason: "invalid", userId: adm2 });
    expect(await authenticate(d, "nobody@example.test", "x", "9.9.9.7")).toMatchObject({ ok: false, userId: undefined }); // unknown email: nothing to log against

    // every user is listed (admins + tenants), with counts; most recently active first
    const all = await listUsersWithActivity(d, { limit: 50, offset: 0 });
    expect(all).toHaveLength(4);
    expect(all.find((u) => u.id === adm)!.actions).toBeGreaterThan(0);
    const quiet = all.find((u) => u.name === "Quiet Tenant")!;
    expect(quiet.actions).toBe(0);
    expect(quiet.last).toBeNull();
    expect(all[all.length - 1].actions).toBe(0); // never-active users sort last
    expect((await listUsersWithActivity(d, { role: "tenant", limit: 50, offset: 0 })).map((u) => u.name).sort()).toEqual(["Log Tenant", "Quiet Tenant"]);
    expect((await listUsersWithActivity(d, { q: "second", limit: 50, offset: 0 })).map((u) => u.name)).toEqual(["Second Admin"]);
    expect(await listUsersWithActivity(d, { q: "%", limit: 50, offset: 0 })).toHaveLength(4); // wildcard characters can't be abused

    // BY: second admin's own actions only
    const second = (await getLoggedUser(d, adm2))!;
    const by = await userLogs(d, { id: second.id, tenantId: null }, { scope: "by", category: "all", limit: 50, offset: 0 });
    expect(by.map((r) => r.action)).toEqual(expect.arrayContaining(["payment.record"]));
    expect(by.every((r) => r.action !== "tenant.create")).toBe(true); // that was the first admin
    expect((await userLogs(d, { id: second.id, tenantId: null }, { scope: "by", category: "auth", limit: 50, offset: 0 })).every((r) => r.action.startsWith("auth."))).toBe(true);
    expect(by.find((r) => r.action === "payment.record")!.details).toContain("25000");

    // ABOUT: what was done to the tenant record (by others), separate from their own actions
    const tenantUser = (await getLoggedUser(d, ua))!;
    expect(tenantUser.tenantId).toBe(a);
    const about = await userLogs(d, { id: tenantUser.id, tenantId: tenantUser.tenantId }, { scope: "about", category: "all", limit: 50, offset: 0 });
    expect(about.some((r) => r.action === "tenant.create" && r.actorName === "Owner")).toBe(true);
    expect(about.some((r) => r.action === "auth.login")).toBe(false); // own login belongs under "by"
    const byTenant = await userLogs(d, { id: tenantUser.id, tenantId: tenantUser.tenantId }, { scope: "by", category: "all", limit: 50, offset: 0 });
    expect(byTenant.map((r) => r.action)).toEqual(["auth.login"]);

    expect(await getLoggedUser(d, "nope")).toBeNull();
    expect(actionLabel("payment.void")).toBe("Voided a payment");
    expect(actionLabel("weird.new_action")).toBe("Weird new action");
    expect(describeDetails('{"amount":25000,"method":"cash","skip":null}')).toEqual([{ k: "amount", v: "₹250" }, { k: "method", v: "cash" }]);
    expect(describeDetails("not json")).toEqual([]);
  });
});

describe("tenant rent ledger & shared expense list", () => {
  it("shows every month since joining (billed or not) and the tenant's share status, privately", async () => {
    const { myRentLedger, mySharedItems } = await import("@/services/portal");
    const { addExpense } = await import("@/services/misc");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const beds = await allBeds(d);
    const a = await addTenant(d, adm, { bedId: beds[0].id, joining: "2026-01-15", name: "Ledger A", rent: 100000 });
    const b = await addTenant(d, adm, { bedId: beds[1].id, joining: "2026-02-01", name: "Ledger B", rent: 100000 });
    const uid = async (t: string) => (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, t)))[0].userId;
    const [ua, ub] = [await uid(a), await uid(b)];

    // bills exist only for Feb and Apr
    await syncInvoices(d, adm, "2026-02");
    await syncInvoices(d, adm, "2026-04");
    const ledger = (await myRentLedger(d, ua, "2026-04"))!;
    expect(ledger.months.map((m) => m.month)).toEqual(["2026-04", "2026-03", "2026-02", "2026-01"]); // Jan(joined)…Apr, newest first
    expect(ledger.months.find((m) => m.month === "2026-03")!.invoice).toBeNull(); // not billed yet but still listed
    expect(ledger.months.find((m) => m.month === "2026-01")!.invoice).toBeNull();
    expect(ledger.months.find((m) => m.month === "2026-02")!.invoice).toMatchObject({ totalPaise: 100000, rentPaise: 100000 });
    // B joined in Feb: no January row
    expect((await myRentLedger(d, ub, "2026-04"))!.months.map((m) => m.month)).toEqual(["2026-04", "2026-03", "2026-02"]);
    expect(await myRentLedger(d, "unknown-user", "2026-04")).toBeNull();

    // a vacated tenant's ledger stops at the month they left
    await vacateTenant(d, adm, b, "2026-03-20");
    expect((await myRentLedger(d, ub, "2026-06"))!.months.map((m) => m.month)).toEqual(["2026-04", "2026-03", "2026-02"]); // Apr invoice still shown (it exists), nothing after

    // shared expense (April): each tenant sees only their own share line, with paid status from payments
    await addExpense(d, adm, { category: "water", amountPaise: 20000, spentOn: "2026-04-10", description: "Terrace", share: { mode: "equal" } });
    const itemsA = await mySharedItems(d, ua);
    expect(itemsA).toHaveLength(1);
    expect(itemsA[0]).toMatchObject({ description: "Water: Terrace", amountPaise: 20000, totalPaise: 20000, status: "unpaid", balance: 20000 }); // B vacated in March, so A is the only active tenant in April
    const [invA] = (await d.select().from(invoices).where(and(eq(invoices.tenantId, a), eq(invoices.periodMonth, "2026-04"))));
    await recordPayment(d, adm, { invoiceId: invA.id, amountPaise: 100000, paidOn: "2026-04-05", method: "cash" }); // exactly the RENT
    expect((await mySharedItems(d, ua))[0]).toMatchObject({ status: "unpaid", covered: 0 }); // paying rent never settles an expense
    await recordPayment(d, adm, { invoiceId: invA.id, purpose: "expense", amountPaise: 4000, paidOn: "2026-04-06", method: "cash" });
    expect((await mySharedItems(d, ua))[0]).toMatchObject({ status: "partial", covered: 4000, balance: 16000 });
    await recordPayment(d, adm, { invoiceId: invA.id, purpose: "expense", amountPaise: 16000, paidOn: "2026-04-07", method: "cash" });
    expect((await mySharedItems(d, ua))[0]).toMatchObject({ status: "paid", balance: 0 });
    // B's list is B's own
    expect((await mySharedItems(d, ub)).every((i) => i.invoiceId !== invA.id)).toBe(true);
    expect(await mySharedItems(d, "unknown-user")).toEqual([]);
  });
});

describe("public website", () => {
  it("stores owner-chosen details and photos, caps photos, and only ever serves images", async () => {
    const { getWebsiteInfo, updateWebsiteInfo, addSitePhoto, listSitePhotos, deleteSitePhoto, getSitePhoto, MAX_SITE_PHOTOS, DEFAULT_WEBSITE } = await import("@/services/website");
    const { validateFile } = await import("@/services/documents");
    const d = await testDb();
    const adm = await seedAdmin(d);
    expect(await getWebsiteInfo(d)).toEqual(DEFAULT_WEBSITE); // sensible defaults on a fresh install
    const info = { pgName: "Sunrise Ladies PG", tagline: "Safe & homely", about: "Near the metro", address: "12, MG Road", contactPhone: "98765 43210", whatsapp: "9876543210", contactEmail: "hello@example.test", mapsLink: "https://maps.app.goo.gl/abc" };
    await updateWebsiteInfo(d, adm, info);
    expect(await getWebsiteInfo(d)).toEqual(info);
    const png = (n: number) => new File([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, 9)])], "room.png", { type: "image/png" });
    await expect(addSitePhoto(d, adm, await validateFile(new File(["%PDF-1.4 x"], "x.pdf"), "id_proof"), "pdf")).rejects.toThrow(/JPG, PNG or WebP/); // a PDF can never be published
    await expect(validateFile(new File(["<script>alert(1)</script>"], "x.png", { type: "image/png" }), "photo")).rejects.toThrow(/Unsupported/); // disguised script rejected
    const id = await addSitePhoto(d, adm, await validateFile(png(40), "photo"), "  Bedroom 1  ");
    expect((await listSitePhotos(d))[0]).toMatchObject({ id, caption: "Bedroom 1" });
    expect(Object.keys((await listSitePhotos(d))[0])).not.toContain("data"); // lists never carry image bytes
    const got = await getSitePhoto(d, id);
    expect(got?.mimeType).toBe("image/png");
    expect(Buffer.isBuffer(got!.data)).toBe(true);
    expect(await getSitePhoto(d, "nope")).toBeNull();
    for (let i = 1; i < MAX_SITE_PHOTOS; i++) await addSitePhoto(d, adm, await validateFile(png(10 + i), "photo"), `P${i}`);
    await expect(addSitePhoto(d, adm, await validateFile(png(99), "photo"), "one too many")).rejects.toThrow(/up to 12/);
    await deleteSitePhoto(d, adm, id);
    expect(await getSitePhoto(d, id)).toBeNull();
    expect(await listSitePhotos(d)).toHaveLength(MAX_SITE_PHOTOS - 1);
    await expect(deleteSitePhoto(d, adm, "nope")).rejects.toThrow(/not found/);
  });
});

describe("admin login-as-tenant sessions", () => {
  it("are short-lived, tied to the admin, and expire", async () => {
    const { createSession, getSessionUser, IMPERSONATION_MINUTES, SESSION_DAYS } = await import("@/lib/auth-core");
    const { sessions } = await import("@/db/schema");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const t = await addTenant(d, adm, { name: "View As" });
    const tu = (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, t)))[0].userId;
    const now = Date.now();
    const imp = await createSession(d, tu, "ua", now, { impersonatedBy: adm });
    const normal = await createSession(d, tu, "ua", now);
    const u = (await getSessionUser(d, imp.token, now))!;
    expect(u).toMatchObject({ id: tu, role: "tenant", impersonatedBy: adm }); // acts as the TENANT: no admin powers while viewing
    expect((await getSessionUser(d, normal.token, now))!.impersonatedBy).toBeNull();
    expect(imp.expiresAt.getTime() - now).toBe(IMPERSONATION_MINUTES * 60_000);
    expect(normal.expiresAt.getTime() - now).toBe(SESSION_DAYS * 86400_000);
    expect(await getSessionUser(d, imp.token, now + (IMPERSONATION_MINUTES + 1) * 60_000)).toBeNull(); // gone after an hour
    expect(await getSessionUser(d, normal.token, now + 3600_000 * 5)).not.toBeNull();
    // deleting the admin removes any viewing sessions tied to them
    await d.delete(sessions).where(eq(sessions.userId, tu));
  });
});

describe("collect all dues since check-in", () => {
  it("bills missing months, settles oldest-first up to the last due date, and handles partial/over amounts", async () => {
    const { previewDues, collectDues, lastDueMonth } = await import("@/services/collect");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const beds = await allBeds(d);
    const t = await addTenant(d, adm, { bedId: beds[0].id, joining: "2026-01-20", name: "Collect Me", rent: 100000 });
    const other = await addTenant(d, adm, { bedId: beds[1].id, joining: "2026-01-01", name: "Other", rent: 100000 });
    // due day is 5: before the 5th, the "last due" month is the previous month
    expect(lastDueMonth("2026-04-03", 5)).toBe("2026-03");
    expect(lastDueMonth("2026-04-05", 5)).toBe("2026-04");
    const TODAY = "2026-04-10"; // Jan, Feb, Mar, Apr dues have all arrived

    await syncInvoices(d, adm, "2026-02", t); // only Feb exists; Jan/Mar/Apr were never billed
    await recordPayment(d, adm, { invoiceId: (await d.select().from(invoices).where(and(eq(invoices.tenantId, t), eq(invoices.periodMonth, "2026-02"))))[0].id, amountPaise: 30000, paidOn: "2026-02-06", method: "cash" });

    const pre = await previewDues(d, t, "rent", TODAY);
    expect(pre.rows.map((r) => r.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]); // oldest first, from the check-in month
    expect(pre.toBill).toBe(3);
    expect(pre.total).toBe(100000 + 70000 + 100000 + 100000); // Feb is partly paid already
    expect((await d.select().from(invoices).where(eq(invoices.tenantId, t))).length).toBe(1); // preview wrote nothing

    // partial: 1,500 goes to January first, then 500 to February
    const part = await collectDues(d, adm, { tenantId: t, amountPaise: 150000, paidOn: "2026-04-10", method: "upi", reference: "UTR1" }, TODAY);
    expect(part.payments.map((p) => [p.month, p.amountPaise])).toEqual([["2026-01", 100000], ["2026-02", 50000]]);
    expect(part.remaining).toBe(pre.total - 150000);
    const invs = await d.select().from(invoices).where(eq(invoices.tenantId, t));
    expect(invs.map((i) => i.periodMonth).sort()).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]); // missing bills were created
    expect(new Set((await d.select().from(payments).where(eq(payments.tenantId, t))).map((p) => p.receiptNo)).size).toBe(3); // a receipt per month

    // over-collecting is refused; empty amount collects everything that's left
    await expect(collectDues(d, adm, { tenantId: t, amountPaise: 999999999, paidOn: "2026-04-10", method: "cash" }, TODAY)).rejects.toThrow(/more than the total rent due/);
    const rest = await collectDues(d, adm, { tenantId: t, paidOn: "2026-04-11", method: "cash" }, TODAY);
    expect(rest.remaining).toBe(0);
    expect((await d.select().from(invoices).where(eq(invoices.tenantId, t))).every((i) => i.paidPaise === i.totalPaise)).toBe(true);
    await expect(collectDues(d, adm, { tenantId: t, paidOn: "2026-04-11", method: "cash" }, TODAY)).rejects.toThrow(/No rent is due/);

    // nothing leaks to other tenants; before the first due date there's nothing to collect
    expect((await d.select().from(payments).where(eq(payments.tenantId, other))).length).toBe(0);
    const fresh = await addTenant(d, adm, { joining: "2026-04-08", name: "Brand New", rent: 100000 });
    await expect(collectDues(d, adm, { tenantId: fresh, paidOn: "2026-04-10", method: "cash" }, "2026-04-10")).resolves.toBeDefined(); // joined 8 Apr; April's due date (5th) has passed
    await expect(collectDues(d, adm, { tenantId: "nope", paidOn: "2026-04-10", method: "cash" }, TODAY)).rejects.toThrow(/not found/);
  });

  it("stops at the vacate month for tenants who left", async () => {
    const { previewDues } = await import("@/services/collect");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const t = await addTenant(d, adm, { joining: "2026-01-01", name: "Left", rent: 100000 });
    await vacateTenant(d, adm, t, "2026-02-15");
    expect((await previewDues(d, t, "rent", "2026-06-10")).rows.map((r) => r.month)).toEqual(["2026-01", "2026-02"]);
  });
});

describe("expense categories", () => {
  it("includes cooking gas with a readable label", async () => {
    const { categoryLabel, EXPENSE_CATEGORIES } = await import("@/lib/categories");
    const { addExpense } = await import("@/services/misc");
    expect(EXPENSE_CATEGORIES).toContain("cooking_gas");
    expect(categoryLabel("cooking_gas")).toBe("Gas cylinder");
    expect(categoryLabel("repairs")).toBe("Repairs & maintenance");
    expect(categoryLabel("something_new")).toBe("Something new");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const beds = await allBeds(d);
    const a = await addTenant(d, adm, { bedId: beds[0].id, name: "Gas A", rent: 100000 });
    await syncInvoices(d, adm, "2026-03");
    await addExpense(d, adm, { category: "cooking_gas", amountPaise: 150000, spentOn: "2026-03-12", description: "LPG cylinder", share: { mode: "equal" } });
    const [inv] = await d.select().from(invoices).where(eq(invoices.tenantId, a));
    expect((await d.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id))).some((i) => i.description === "Gas cylinder: LPG cylinder")).toBe(true);
  });
});

describe("admin profile photo", () => {
  it("lets a user set/replace/remove their own photo and only admins or the owner can read it", async () => {
    const { setUserPhoto, removeUserPhoto, getUserPhoto, userPhotoVersion, userIdsWithPhotos } = await import("@/services/avatars");
    const { createAdminUser, listAdmins } = await import("@/services/admins");
    const d = await testDb();
    const adm = await seedAdmin(d);
    await createAdminUser(d, adm, { name: "Second", email: "second@example.test", password: "SecondPassword1" });
    const adm2 = (await listAdmins(d)).find((a) => a.email === "second@example.test")!.id;
    const t = await addTenant(d, adm, { name: "Some Tenant" });
    const tu = (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, t)))[0].userId;
    const png = (n: number) => new File([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, 5)])], "me.png", { type: "image/png" });

    expect(await userPhotoVersion(d, adm)).toBeNull();
    await expect(removeUserPhoto(d, adm)).rejects.toThrow(/don't have/);
    await expect(setUserPhoto(d, adm, new File(["%PDF-1.4 x"], "x.pdf"))).rejects.toThrow(/must be an image/);
    await expect(setUserPhoto(d, adm, new File(["<script>1</script>"], "x.png", { type: "image/png" }))).rejects.toThrow(/Unsupported/);
    await setUserPhoto(d, adm, png(30));
    await setUserPhoto(d, adm, png(60)); // replaces, still one row
    expect(await userPhotoVersion(d, adm)).not.toBeNull();
    expect([...(await userIdsWithPhotos(d))]).toEqual([adm]);

    expect((await getUserPhoto(d, adm, { id: adm, role: "admin" }))?.mimeType).toBe("image/png"); // the owner
    expect((await getUserPhoto(d, adm, { id: adm2, role: "admin" }))?.data.length).toBeGreaterThan(0); // another admin
    expect(await getUserPhoto(d, adm, { id: tu, role: "tenant" })).toBeNull(); // a tenant can't see admin photos
    expect(await getUserPhoto(d, "nope", { id: adm, role: "admin" })).toBeNull();
    await removeUserPhoto(d, adm);
    expect(await userPhotoVersion(d, adm)).toBeNull();
  });
});

describe("rent vs expenses, optional description, and the merged payments list", () => {
  it("keeps rent and expenses separate everywhere and shows reported + recorded payments together", async () => {
    const { addExpense } = await import("@/services/misc");
    const { rentVsExpenses } = await import("@/services/reports");
    const { paymentActivity, filterCounts, matchesFilter } = await import("@/services/payment-activity");
    const { createClaim, approveClaim, rejectClaim } = await import("@/services/claims");
    const { myRentLedger } = await import("@/services/portal");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const beds = await allBeds(d);
    const a = await addTenant(d, adm, { bedId: beds[0].id, name: "Split A", rent: 100000 });
    const b = await addTenant(d, adm, { bedId: beds[1].id, name: "Split B", rent: 100000 });
    const ua = (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, a)))[0].userId;
    const ub = (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, b)))[0].userId;
    await syncInvoices(d, adm, "2026-03");

    // description is optional: blank falls back to the category name, and tenant bills read cleanly
    const eid = await addExpense(d, adm, { category: "cooking_gas", amountPaise: 60000, spentOn: "2026-03-10", share: { mode: "equal" } });
    expect((await d.select().from(expenses).where(eq(expenses.id, eid)))[0].description).toBe("Gas cylinder");
    const items = await d.select().from(invoiceItems);
    expect(items.filter((i) => i.expenseId === eid).every((i) => i.description === "Gas cylinder")).toBe(true); // not "Gas cylinder: Gas cylinder"
    await addExpense(d, adm, { category: "water", amountPaise: 5000, spentOn: "2026-03-11", description: "   " }); // whitespace-only counts as blank
    expect((await d.select().from(expenses).where(eq(expenses.category, "water")))[0].description).toBe("Water");

    // admin dashboard split: each bill = rent 1000 + expense share 300
    let s = await rentVsExpenses(d, "2026-03");
    expect(s).toMatchObject({ rentBilled: 200000, rentCollected: 0, rentPending: 200000, expenseBilled: 60000, expenseCollected: 0, expensePending: 60000 });
    const [invA] = await d.select().from(invoices).where(and(eq(invoices.tenantId, a), eq(invoices.periodMonth, "2026-03")));
    await recordPayment(d, adm, { invoiceId: invA.id, amountPaise: 100000, paidOn: "2026-03-05", method: "cash" }); // the rent
    await recordPayment(d, adm, { invoiceId: invA.id, purpose: "expense", amountPaise: 10000, paidOn: "2026-03-05", method: "cash" }); // 100 toward the expense share
    s = await rentVsExpenses(d, "2026-03");
    expect(s).toMatchObject({ rentCollected: 100000, rentPending: 100000, expenseCollected: 10000, expensePending: 50000 });
    expect(s.rentCollected + s.rentPending).toBe(s.rentBilled);
    expect(s.expenseCollected + s.expensePending).toBe(s.expenseBilled);

    // the tenant's ledger carries the pieces the dashboard needs
    const ledger = (await myRentLedger(d, ua, "2026-03"))!;
    expect(ledger.months[0].invoice).toMatchObject({ rentPaise: 100000, otherPaise: 30000, adjustmentPaise: 0 });

    // ONE payments list: recorded payments + reported ones (waiting / rejected); an approved report appears once, as the payment
    const [invB] = await d.select().from(invoices).where(and(eq(invoices.tenantId, b), eq(invoices.periodMonth, "2026-03")));
    const c1 = await createClaim(d, ub, { invoiceId: invB.id, amountPaise: 50000, paidOn: "2026-03-06", method: "upi", reference: "U1" }, "2026-03-10");
    const c2 = await createClaim(d, ub, { invoiceId: invB.id, amountPaise: 20000, paidOn: "2026-03-07", method: "cash" }, "2026-03-10");
    const c3 = await createClaim(d, ub, { invoiceId: invB.id, amountPaise: 10000, paidOn: "2026-03-08", method: "cash" }, "2026-03-10");
    await approveClaim(d, adm, c1, 50000);
    await rejectClaim(d, adm, c2, "Not received");
    let rows = await paymentActivity(d);
    expect(rows.filter((r) => r.kind === "claim").map((r) => [r.id === c3 ? "c3" : r.id === c2 ? "c2" : "c1", r.status]).sort()).toEqual([["c2", "rejected"], ["c3", "waiting"]]); // c1 became a real payment
    expect(rows.filter((r) => r.kind === "payment").length).toBe(3); // A's rent payment + A's expense payment + the approved one
    expect(rows[0].status).toBe("waiting"); // things needing action come first
    let counts = filterCounts(rows);
    expect(counts).toMatchObject({ all: 5, waiting: 1, paid: 3, cancelled: 1 });
    expect(rows.filter((r) => matchesFilter(r, "waiting")).map((r) => r.tenantName)).toEqual(["Split B"]);
    await voidPayment(d, adm, rows.find((r) => r.kind === "payment" && r.tenantName === "Split A")!.id, "wrong entry");
    rows = await paymentActivity(d);
    counts = filterCounts(rows);
    expect(counts).toMatchObject({ all: 5, waiting: 1, paid: 2, cancelled: 2 }); // voided payments + rejected reports are both "cancelled"
    expect(rows.find((r) => r.status === "cancelled" && r.kind === "payment")!.rejectReason).toBe("wrong entry");
  });
});

describe("rent and expenses are paid separately", () => {
  it("each purpose has its own balance, limit, report and void — and expenses split to active tenants by default", async () => {
    const { addExpense } = await import("@/services/misc");
    const { invoiceBuckets, openBills } = await import("@/services/billing");
    const { createClaim, approveClaim } = await import("@/services/claims");
    const { rentVsExpenses, monthlySummary } = await import("@/services/reports");
    const { EXPENSE_CATEGORIES } = await import("@/lib/categories");
    const d = await testDb();
    const adm = await seedAdmin(d);

    // expense categories are fixed to exactly three
    expect([...EXPENSE_CATEGORIES]).toEqual(["electricity", "water", "cooking_gas"]);

    // an expense with nobody living here is simply the owner's own cost (the default split must not error)
    const lonely = await addExpense(d, adm, { category: "electricity", amountPaise: 30000, spentOn: "2026-03-02", share: { mode: "equal" } });
    expect((await d.select().from(expenses).where(eq(expenses.id, lonely)))[0].shareMode).toBe("none");

    const beds = await allBeds(d);
    const a = await addTenant(d, adm, { bedId: beds[0].id, name: "Sep A", rent: 100000 });
    const b = await addTenant(d, adm, { bedId: beds[1].id, name: "Sep B", rent: 100000 });
    const ua = (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, a)))[0].userId;
    await syncInvoices(d, adm, "2026-03");
    // default = split equally among the ACTIVE tenants: 2 tenants -> 300 each
    const gas = await addExpense(d, adm, { category: "cooking_gas", amountPaise: 60000, spentOn: "2026-03-10", share: { mode: "equal" } });
    expect((await d.select().from(expenses).where(eq(expenses.id, gas)))[0].shareMode).toBe("equal");
    const [inv] = await d.select().from(invoices).where(and(eq(invoices.tenantId, a), eq(invoices.periodMonth, "2026-03")));

    let bk = await invoiceBuckets(d, inv.id);
    expect(bk).toMatchObject({ rentPayable: 100000, rentBalance: 100000, expensePayable: 30000, expenseBalance: 30000 });

    // paying EXPENSES never reduces rent, and vice versa
    await recordPayment(d, adm, { invoiceId: inv.id, purpose: "expense", amountPaise: 12000, paidOn: "2026-03-05", method: "cash" });
    bk = await invoiceBuckets(d, inv.id);
    expect(bk).toMatchObject({ rentBalance: 100000, expenseBalance: 18000 });
    const after = (await d.select().from(invoices).where(eq(invoices.id, inv.id)))[0];
    expect([after.paidPaise, after.rentPaidPaise, after.expensePaidPaise]).toEqual([12000, 0, 12000]); // total = rent + expense, always

    // each purpose has its OWN limit: 200 of expenses left, so 250 is refused even though rent is still unpaid
    await expect(recordPayment(d, adm, { invoiceId: inv.id, purpose: "expense", amountPaise: 25000, paidOn: "2026-03-06", method: "cash" })).rejects.toThrow(/exceeds the outstanding expenses balance/);
    await expect(recordPayment(d, adm, { invoiceId: inv.id, purpose: "rent", amountPaise: 100001, paidOn: "2026-03-06", method: "cash" })).rejects.toThrow(/exceeds the outstanding rent balance/);
    await recordPayment(d, adm, { invoiceId: inv.id, purpose: "expense", amountPaise: 18000, paidOn: "2026-03-06", method: "cash" });
    await expect(recordPayment(d, adm, { invoiceId: inv.id, purpose: "expense", amountPaise: 1, paidOn: "2026-03-07", method: "cash" })).rejects.toThrow(/expenses on this bill is already fully paid/);
    expect(await invoiceBuckets(d, inv.id)).toMatchObject({ rentBalance: 100000, expenseBalance: 0 });
    expect((await openBills(d)).find((o) => o.id === inv.id)).toMatchObject({ rentBalance: 100000, expenseBalance: 0 });

    // a tenant's reports are per purpose too, and approving one updates only its own bucket
    const rentClaim = await createClaim(d, ua, { invoiceId: inv.id, purpose: "rent", amountPaise: 100000, paidOn: "2026-03-08", method: "upi" }, "2026-03-10");
    await expect(createClaim(d, ua, { invoiceId: inv.id, purpose: "rent", amountPaise: 1, paidOn: "2026-03-08", method: "upi" }, "2026-03-10")).rejects.toThrow(/already covers/); // rent is fully reported…
    await expect(createClaim(d, ua, { invoiceId: inv.id, purpose: "expense", amountPaise: 1, paidOn: "2026-03-08", method: "upi" }, "2026-03-10")).rejects.toThrow(/expenses on this bill is already fully paid/); // …and expenses are already paid
    await approveClaim(d, adm, rentClaim);
    expect(await invoiceBuckets(d, inv.id)).toMatchObject({ rentBalance: 0, expenseBalance: 0 });
    expect((await d.select().from(payments).where(eq(payments.purpose, "rent"))).length).toBe(1);

    // reports keep the two apart: B has paid nothing, A paid everything
    expect(await rentVsExpenses(d, "2026-03")).toMatchObject({ rentBilled: 200000, rentCollected: 100000, rentPending: 100000, expenseBilled: 60000, expenseCollected: 30000, expensePending: 30000 });
    const m = (await monthlySummary(d, "2026-03", "2026-03"))[0];
    expect(m.collected).toMatchObject({ rent: 100000, other: 30000, total: 130000 }); // the gas-cylinder share lands under expenses, not rent
    expect(m.collected.rent + m.collected.electricity + m.collected.water + m.collected.other).toBe(m.collected.total);

    // cancelling (voiding) an EXPENSE payment reopens only the expense side
    const expPay = (await d.select().from(payments).where(eq(payments.purpose, "expense")))[0];
    await voidPayment(d, adm, expPay.id, "entered wrongly");
    expect(await invoiceBuckets(d, inv.id)).toMatchObject({ rentBalance: 0, expenseBalance: expPay.amountPaise });

    // a discount can't push either side below what was already paid toward it
    const [invB] = await d.select().from(invoices).where(and(eq(invoices.tenantId, b), eq(invoices.periodMonth, "2026-03")));
    await recordPayment(d, adm, { invoiceId: invB.id, amountPaise: 100000, paidOn: "2026-03-09", method: "cash" }); // all of B's rent
    await expect(addInvoiceItem(d, adm, invB.id, "adjustment", "too big", 20000)).rejects.toThrow(/less than what is already paid/); // discount comes off the PAID rent
    await expect(addInvoiceItem(d, adm, invB.id, "adjustment", "still too big", 5000)).rejects.toThrow(/less than what is already paid/); // any discount reaches the rent first, and that is already fully paid
  });
});

describe("each expense is paid on its own", () => {
  it("paying one expense never marks another as paid; reports are tied to one expense", async () => {
    const { mySharedItems } = await import("@/services/portal");
    const { createClaim, approveClaim } = await import("@/services/claims");
    const d = await testDb();
    const adm = await seedAdmin(d);
    const t = await addTenant(d, adm, { name: "Per Item", rent: 100000 });
    const userId = (await d.select().from(tenantProfiles).where(eq(tenantProfiles.id, t)))[0].userId;
    const month = "2026-03";
    await addExpense(d, adm, { category: "water", amountPaise: 30000, spentOn: `${month}-05`, description: "Water", share: { mode: "equal" } });
    await addExpense(d, adm, { category: "electricity", amountPaise: 50000, spentOn: `${month}-06`, description: "Electricity", share: { mode: "equal" } });
    await addExpense(d, adm, { category: "cooking_gas", amountPaise: 20000, spentOn: `${month}-07`, description: "Cylinder", share: { mode: "equal" } });
    const lines = await mySharedItems(d, userId);
    expect(lines.map((l) => l.category).sort()).toEqual(["cooking_gas", "electricity", "water"]);
    const gas = lines.find((l) => l.category === "cooking_gas")!;
    const water = lines.find((l) => l.category === "water")!;
    const inv = (await d.select().from(invoices).where(eq(invoices.tenantId, t)))[0];

    // tenant reports ONLY the gas cylinder → it waits for the owner; nothing else changes
    const claimId = await createClaim(d, userId, { invoiceId: inv.id, purpose: "expense", invoiceItemId: gas.itemId, amountPaise: gas.balance, paidOn: `${month}-10`, method: "upi" }, `${month}-10`);
    let now = await mySharedItems(d, userId);
    expect(now.find((l) => l.category === "cooking_gas")).toMatchObject({ pending: gas.balance, status: "unpaid" });
    expect(now.filter((l) => l.category !== "cooking_gas").every((l) => l.pending === 0)).toBe(true);
    // asking again for the same expense, or for more than it costs, is refused
    await expect(createClaim(d, userId, { invoiceId: inv.id, purpose: "expense", invoiceItemId: gas.itemId, amountPaise: 1, paidOn: `${month}-10`, method: "cash" }, `${month}-10`)).rejects.toThrow(/waiting/);
    await expect(createClaim(d, userId, { invoiceId: inv.id, purpose: "expense", amountPaise: 100, paidOn: `${month}-10`, method: "cash" }, `${month}-10`)).rejects.toThrow(/Choose which expense/);
    await expect(createClaim(d, userId, { invoiceId: inv.id, purpose: "expense", invoiceItemId: water.itemId, amountPaise: water.balance + 1, paidOn: `${month}-10`, method: "cash" }, `${month}-10`)).rejects.toThrow(/left to pay/);

    // owner confirms → ONLY the gas cylinder becomes paid; water and electricity stay unpaid
    await approveClaim(d, adm, claimId);
    now = await mySharedItems(d, userId);
    expect(now.find((l) => l.category === "cooking_gas")).toMatchObject({ status: "paid", balance: 0 });
    expect(now.find((l) => l.category === "water")).toMatchObject({ status: "unpaid", balance: water.balance });
    expect(now.find((l) => l.category === "electricity")).toMatchObject({ status: "unpaid" });
    // the rent was never touched
    expect((await d.select().from(invoices).where(eq(invoices.id, inv.id)))[0]).toMatchObject({ rentPaidPaise: 0, expensePaidPaise: gas.balance });
  });
});
