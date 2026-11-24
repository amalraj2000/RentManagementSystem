export type InvoiceStatus = "unpaid" | "partial" | "paid" | "overdue" | "cancelled";

/**
 * Status rules:
 *  - balance <= 0            -> paid
 *  - balance > 0 and today > due date -> overdue (even if partially paid)
 *  - balance > 0 and paid > 0 -> partial
 *  - otherwise                -> unpaid
 * A bill is due ON its due date, overdue only the day after.
 */
export function invoiceStatus(
  inv: { totalPaise: number; paidPaise: number; dueDate: string; cancelledAt?: Date | null },
  today: string,
): InvoiceStatus {
  if (inv.cancelledAt) return "cancelled";
  const balance = inv.totalPaise - inv.paidPaise;
  if (balance <= 0) return "paid";
  if (today > inv.dueDate) return "overdue";
  return inv.paidPaise > 0 ? "partial" : "unpaid";
}

export const balanceOf = (inv: { totalPaise: number; paidPaise: number }) => Math.max(inv.totalPaise - inv.paidPaise, 0);

/** Every month from `from` to `to` inclusive (YYYY-MM), newest first. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out.reverse();
}

export type RentState = "paid" | "waiting" | "overdue" | "partial" | "unpaid";

/**
 * What a tenant sees for a month: Paid · Waiting for confirmation (they reported a payment that covers the balance) ·
 * Overdue · Partly paid · Unpaid. A month is only "Paid" once the owner has confirmed.
 */
export function rentState(inv: { totalPaise: number; paidPaise: number; dueDate: string; cancelledAt?: Date | null }, pendingPaise: number, today: string): RentState {
  const balance = inv.totalPaise - inv.paidPaise;
  if (balance <= 0) return "paid";
  if (pendingPaise >= balance) return "waiting";
  const s = invoiceStatus(inv, today);
  return s === "overdue" ? "overdue" : s === "partial" ? "partial" : "unpaid";
}
