import { and, desc, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { bedAssignments, beds, invoices, payments, rooms, tenantProfiles, users } from "@/db/schema";
import { monthsBetween } from "@/lib/billing";

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
      dateOfBirth: tenantProfiles.dateOfBirth,
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

// ---------- Rent ledger (tenant-facing, always scoped to the session user) ----------

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
    })
    .from(invoices)
    .where(eq(invoices.tenantId, t.id));
  const byMonth = new Map(rows.map((r) => [r.periodMonth, r]));
  const start = t.joiningDate.slice(0, 7);
  const end = t.moveOutDate && t.moveOutDate.slice(0, 7) < currentMonth ? t.moveOutDate.slice(0, 7) : currentMonth;
  const months = new Set([...monthsBetween(start, end), ...byMonth.keys()]);
  const list = [...months].sort().reverse().map((month) => ({ month, invoice: byMonth.get(month) ?? null }));
  return { tenant: t, months: list };
}
