import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { bedAssignments, beds, expenseAllocations, expenses, invoiceItems, invoices, payments, rooms, tenantProfiles, users, utilityBills } from "@/db/schema";
import { itemSettlement, monthsBetween } from "@/lib/billing";

/**
 * Tenant-facing data access. Every function derives the tenant from the authenticated
 * user id (server-side session) — there is no tenant-id parameter a client could tamper with.
 */
export async function tenantForUser(db: DB, userId: string) {
  const [row] = await db
    .select({
      id: tenantProfiles.id,
      name: users.name,
      email: users.email,
      phone: tenantProfiles.phone,
      status: tenantProfiles.status,
      joiningDate: tenantProfiles.joiningDate,
      moveOutDate: tenantProfiles.moveOutDate,
      monthlyRentPaise: tenantProfiles.monthlyRentPaise,
      securityDepositPaise: tenantProfiles.securityDepositPaise,
      emergencyContactName: tenantProfiles.emergencyContactName,
      emergencyContactPhone: tenantProfiles.emergencyContactPhone,
      roomName: rooms.name,
      bedNumber: beds.bedNumber,
    })
    .from(tenantProfiles)
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .leftJoin(bedAssignments, and(eq(bedAssignments.tenantId, tenantProfiles.id), isNull(bedAssignments.endDate)))
    .leftJoin(beds, eq(beds.id, bedAssignments.bedId))
    .leftJoin(rooms, eq(rooms.id, beds.roomId))
    .where(eq(tenantProfiles.userId, userId));
  return row ?? null;
}

export async function myInvoices(db: DB, userId: string, limit = 24) {
  const t = await tenantForUser(db, userId);
  if (!t) return [];
  return db
    .select({ id: invoices.id, periodMonth: invoices.periodMonth, dueDate: invoices.dueDate, totalPaise: invoices.totalPaise, paidPaise: invoices.paidPaise, cancelledAt: invoices.cancelledAt })
    .from(invoices)
    .where(eq(invoices.tenantId, t.id))
    .orderBy(desc(invoices.periodMonth))
    .limit(limit);
}

export async function myPayments(db: DB, userId: string, limit = 50) {
  const t = await tenantForUser(db, userId);
  if (!t) return [];
  return db
    .select({ id: payments.id, receiptNo: payments.receiptNo, amountPaise: payments.amountPaise, paidOn: payments.paidOn, method: payments.method, periodMonth: invoices.periodMonth })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(payments.tenantId, t.id), isNull(payments.voidedAt)))
    .orderBy(desc(payments.paidOn))
    .limit(limit);
}

/** Expenses the owner shared with this tenant (their own share + the expense total). */
export async function mySharedExpenses(db: DB, userId: string, limit = 12) {
  const t = await tenantForUser(db, userId);
  if (!t) return [];
  return db
    .select({ id: expenses.id, category: expenses.category, description: expenses.description, spentOn: expenses.spentOn, totalPaise: expenses.amountPaise, sharePaise: expenseAllocations.amountPaise, mode: expenses.shareMode })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .where(eq(expenseAllocations.tenantId, t.id))
    .orderBy(desc(expenses.spentOn))
    .limit(limit);
}

// ---------- Rent ledger & shared expenses (tenant-facing, always scoped to the session user) ----------

/** One row per month from joining until now (or until they vacated), whether or not a bill exists yet. */
export async function myRentLedger(db: DB, userId: string, currentMonth: string) {
  const t = await tenantForUser(db, userId);
  if (!t) return null;
  const rows = await db
    .select({
      id: invoices.id,
      periodMonth: invoices.periodMonth,
      dueDate: invoices.dueDate,
      totalPaise: invoices.totalPaise,
      paidPaise: invoices.paidPaise,
      cancelledAt: invoices.cancelledAt,
      rentPaise: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'rent' then ${invoiceItems.amountPaise} else 0 end), 0)`,
    })
    .from(invoices)
    .leftJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
    .where(eq(invoices.tenantId, t.id))
    .groupBy(invoices.id);
  const byMonth = new Map(rows.map((r) => [r.periodMonth, { ...r, rentPaise: Number(r.rentPaise) }]));
  const start = t.joiningDate.slice(0, 7);
  const end = t.moveOutDate && t.moveOutDate.slice(0, 7) < currentMonth ? t.moveOutDate.slice(0, 7) : currentMonth;
  const months = new Set([...monthsBetween(start, end), ...byMonth.keys()]);
  const list = [...months].sort().reverse().map((month) => ({ month, invoice: byMonth.get(month) ?? null }));
  return { tenant: t, months: list };
}

/** The tenant's share of shared expenses and utility bills, with how much of each line is covered by their payments. */
export async function mySharedItems(db: DB, userId: string) {
  const t = await tenantForUser(db, userId);
  if (!t) return [];
  const shared = await db
    .select({
      itemId: invoiceItems.id,
      invoiceId: invoices.id,
      kind: invoiceItems.kind,
      description: invoiceItems.description,
      amountPaise: invoiceItems.amountPaise,
      month: invoices.periodMonth,
      dueDate: invoices.dueDate,
      invoiceTotal: invoices.totalPaise,
      invoicePaid: invoices.paidPaise,
      expenseId: invoiceItems.expenseId,
      expenseCategory: expenses.category,
      spentOn: expenses.spentOn,
      expenseTotal: expenses.amountPaise,
      billTotal: utilityBills.totalPaise,
      createdAt: invoiceItems.createdAt,
    })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoices.id, invoiceItems.invoiceId))
    .leftJoin(expenses, eq(expenses.id, invoiceItems.expenseId))
    .leftJoin(utilityBills, eq(utilityBills.id, invoiceItems.utilityBillId))
    .where(and(eq(invoices.tenantId, t.id), sql`(${invoiceItems.expenseId} is not null or ${invoiceItems.utilityBillId} is not null)`))
    .orderBy(desc(invoices.periodMonth), asc(invoiceItems.createdAt));
  if (!shared.length) return [];
  const invIds = [...new Set(shared.map((s) => s.invoiceId))];
  const allItems = await db.select({ id: invoiceItems.id, invoiceId: invoiceItems.invoiceId, kind: invoiceItems.kind, amountPaise: invoiceItems.amountPaise }).from(invoiceItems).where(inArray(invoiceItems.invoiceId, invIds));
  const settle = new Map(invIds.map((id) => [id, itemSettlement(allItems.filter((i) => i.invoiceId === id), shared.find((s) => s.invoiceId === id)!.invoicePaid)]));
  return shared.map((s) => {
    const st = settle.get(s.invoiceId)!.get(s.itemId) ?? { payable: s.amountPaise, covered: 0, status: "unpaid" as const };
    // Category shown to the tenant: the expense category, or Electricity / Water for utility bills.
    const category = s.expenseCategory ?? (s.kind === "electricity" || s.kind === "water" ? s.kind : "other");
    return { ...s, category, totalPaise: s.expenseTotal ?? s.billTotal ?? s.amountPaise, covered: st.covered, status: st.status, balance: Math.max(st.payable - st.covered, 0), invoiceBalance: Math.max(s.invoiceTotal - s.invoicePaid, 0) };
  });
}
