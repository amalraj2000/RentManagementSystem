import { desc, eq, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { invoices, paymentClaims, payments, tenantProfiles, users } from "@/db/schema";
import { invoiceBuckets } from "./billing";

export type ActivityStatus = "paid" | "waiting" | "cancelled" | "rejected";
export type ActivityRow = {
  key: string;
  kind: "payment" | "claim";
  id: string;
  tenantId: string;
  tenantName: string;
  invoiceId: string;
  month: string;
  amountPaise: number;
  /** Rent and expenses are paid separately. */
  purpose: "rent" | "expense";
  date: string;
  method: "cash" | "upi" | "bank_transfer" | "other";
  reference: string | null;
  note: string | null;
  status: ActivityStatus;
  receiptNo: string | null;
  hasProof: boolean;
  rejectReason: string | null;
  /** What is still unpaid on the bill (used as the default when confirming a reported payment). */
  balance: number;
  createdAt: number;
};

export type ActivityFilter = "all" | "waiting" | "paid" | "cancelled";
export const FILTERS: ActivityFilter[] = ["all", "waiting", "paid", "cancelled"];

/**
 * ONE list of payment activity: recorded payments (paid, or cancelled/voided) and payments tenants REPORTED that are still
 * waiting or were rejected. Confirmed reports are not repeated — they already exist as real payments.
 */
export async function paymentActivity(db: DB): Promise<ActivityRow[]> {
  const [pays, claims] = await Promise.all([
    db
      .select({ p: payments, name: users.name, month: invoices.periodMonth, balance: sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}` })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(tenantProfiles, eq(tenantProfiles.id, payments.tenantId))
      .innerJoin(users, eq(users.id, tenantProfiles.userId))
      .orderBy(desc(payments.paidOn), desc(payments.createdAt))
      .limit(2000),
    db
      .select({ c: { purpose: paymentClaims.purpose, id: paymentClaims.id, invoiceId: paymentClaims.invoiceId, tenantId: paymentClaims.tenantId, amountPaise: paymentClaims.amountPaise, paidOn: paymentClaims.paidOn, method: paymentClaims.method, reference: paymentClaims.reference, note: paymentClaims.note, status: paymentClaims.status, rejectReason: paymentClaims.rejectReason, hasShot: sql<number>`${paymentClaims.screenshot} is not null`, createdAt: paymentClaims.createdAt }, name: users.name, month: invoices.periodMonth, balance: sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}` })
      .from(paymentClaims)
      .innerJoin(invoices, eq(invoices.id, paymentClaims.invoiceId))
      .innerJoin(tenantProfiles, eq(tenantProfiles.id, paymentClaims.tenantId))
      .innerJoin(users, eq(users.id, tenantProfiles.userId))
      .where(ne(paymentClaims.status, "approved"))
      .orderBy(desc(paymentClaims.createdAt))
      .limit(2000),
  ]);
  const rows: ActivityRow[] = [
    ...pays.map(({ p, name, month, balance }): ActivityRow => ({
      key: `p:${p.id}`, kind: "payment", id: p.id, tenantId: p.tenantId, tenantName: name, invoiceId: p.invoiceId, month, amountPaise: p.amountPaise, purpose: p.purpose, date: p.paidOn,
      method: p.method, reference: p.reference, note: p.note, status: p.voidedAt ? "cancelled" : "paid", receiptNo: p.receiptNo, hasProof: false,
      rejectReason: p.voidReason, balance: Number(balance), createdAt: p.createdAt.getTime(),
    })),
    ...claims.map(({ c, name, month, balance }): ActivityRow => ({
      key: `c:${c.id}`, kind: "claim", id: c.id, tenantId: c.tenantId, tenantName: name, invoiceId: c.invoiceId, month, amountPaise: c.amountPaise, purpose: c.purpose, date: c.paidOn,
      method: c.method, reference: c.reference, note: c.note, status: c.status === "pending" ? "waiting" : "rejected", receiptNo: null, hasProof: Number(c.hasShot) > 0,
      rejectReason: c.rejectReason, balance: Number(balance), createdAt: c.createdAt.getTime(),
    })),
  ];
  // for reports still waiting, "balance" is what is unpaid for THEIR purpose (rent or expenses), not the whole bill
  for (const r of rows) {
    if (r.kind === "claim" && r.status === "waiting") {
      const b = await invoiceBuckets(db, r.invoiceId);
      r.balance = r.purpose === "rent" ? b.rentBalance : b.expenseBalance;
    }
  }
  // waiting items first (they need action), then newest first
  return rows.sort((a, b) => (a.status === "waiting" ? 0 : 1) - (b.status === "waiting" ? 0 : 1) || b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export const matchesFilter = (r: ActivityRow, f: ActivityFilter) =>
  f === "all" || (f === "waiting" && r.status === "waiting") || (f === "paid" && r.status === "paid") || (f === "cancelled" && (r.status === "cancelled" || r.status === "rejected"));

export function filterCounts(rows: ActivityRow[]) {
  return Object.fromEntries(FILTERS.map((f) => [f, rows.filter((r) => matchesFilter(r, f)).length])) as Record<ActivityFilter, number>;
}
