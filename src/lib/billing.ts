import { splitEqually } from "./money";

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

export type Method = "equal_residents" | "equal_beds" | "custom";

/** Allocate `total` across tenant ids. Always sums exactly to total. */
export function allocateUtility(
  total: number,
  method: Method,
  residentIds: string[],
  bedHolderIds: string[],
  custom?: Record<string, number>,
): { tenantId: string; amountPaise: number }[] {
  if (method === "custom") {
    const entries = Object.entries(custom ?? {}).filter(([, v]) => v > 0);
    if (!entries.length) throw new Error("Enter a custom amount for at least one tenant");
    for (const [id, v] of entries) {
      if (!Number.isInteger(v)) throw new Error("Custom amounts must be whole paise");
      if (!residentIds.includes(id)) throw new Error("Custom amount given for a tenant who is not eligible");
    }
    const sum = entries.reduce((a, [, v]) => a + v, 0);
    if (sum !== total) throw new Error(`Custom amounts (${sum / 100}) must add up to the bill total (${total / 100})`);
    return entries.map(([tenantId, amountPaise]) => ({ tenantId, amountPaise }));
  }
  const ids = [...(method === "equal_beds" ? bedHolderIds : residentIds)].sort();
  if (!ids.length) throw new Error("No eligible tenants for this billing period");
  const parts = splitEqually(total, ids.length);
  return ids.map((tenantId, i) => ({ tenantId, amountPaise: parts[i] }));
}

/** Units from meter readings; throws if closing < opening. */
export function unitsFromReadings(opening?: number | null, closing?: number | null): number | null {
  if (opening == null || closing == null) return null;
  if (closing < opening) throw new Error("Closing reading cannot be below the opening reading");
  return closing - opening;
}

/**
 * Split a tenant's payments across invoice item categories (waterfall:
 * rent -> electricity -> water -> other). Adjustments reduce rent.
 * Used for reports so cash collected is attributed to real categories.
 */
export type Cat = "rent" | "electricity" | "water" | "other";
export function waterfall(
  items: { kind: string; amountPaise: number }[],
  paymentAmount: number,
  alreadyAllocated: Record<Cat, number>,
): Record<Cat, number> {
  const net: Record<Cat, number> = { rent: 0, electricity: 0, water: 0, other: 0 };
  for (const it of items) {
    if (it.kind === "adjustment") net.rent += it.amountPaise;
    else net[it.kind as Cat] += it.amountPaise;
  }
  const out: Record<Cat, number> = { rent: 0, electricity: 0, water: 0, other: 0 };
  let left = paymentAmount;
  for (const c of ["rent", "electricity", "water", "other"] as Cat[]) {
    const room = Math.max(net[c] - alreadyAllocated[c], 0);
    const take = Math.min(room, left);
    out[c] = take;
    left -= take;
  }
  out.rent += left; // overpayment / negative-net edge cases fall to rent
  return out;
}
