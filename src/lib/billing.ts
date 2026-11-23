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

/** The categories a payment can be reported under: rent, or one of the expense lines. */
export type Cat = "rent" | "electricity" | "water" | "other";

/**
 * Shows how much of an invoice's PAID amount covers each line, so a tenant can see which items are settled.
 * Same order the reports use (rent → electricity → water → other); discounts reduce the first lines (rent first).
 * The invoice-level paid/total numbers stay the source of truth — this is only a per-line view.
 */
export function itemSettlement<T extends { id: string; kind: string; amountPaise: number }>(items: T[], paidPaise: number) {
  const order = ["rent", "electricity", "water", "other"];
  let discount = items.filter((i) => i.amountPaise < 0).reduce((a, i) => a - i.amountPaise, 0);
  let left = paidPaise;
  const out = new Map<string, { payable: number; covered: number; status: "paid" | "partial" | "unpaid" }>();
  const positives = items.filter((i) => i.amountPaise > 0).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const it of positives) {
    const off = Math.min(it.amountPaise, discount);
    discount -= off;
    const payable = it.amountPaise - off;
    const covered = Math.max(Math.min(payable, left), 0);
    left -= covered;
    out.set(it.id, { payable, covered, status: covered >= payable ? "paid" : covered > 0 ? "partial" : "unpaid" });
  }
  return out;
}

/**
 * Per-expense settlement. Each expense line (electricity / water / gas cylinder / other) is paid on its own:
 * a payment made FOR a line covers only that line (`paidByItem`). Payments not tied to a line (`generalPaid`, e.g. the owner
 * recorded one lump sum) are spread over whatever is still unpaid, in the usual order. `discount` = what is left of a discount after rent.
 */
export function expenseLineSettlement<T extends { id: string; kind: string; amountPaise: number }>(items: T[], paidByItem: Record<string, number>, generalPaid: number, discount = 0) {
  const order = ["electricity", "water", "other"];
  const lines = items.filter((i) => i.kind !== "rent" && i.amountPaise > 0).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  let off = Math.max(discount, 0);
  const rows = lines.map((it) => {
    const cut = Math.min(it.amountPaise, off);
    off -= cut;
    const payable = it.amountPaise - cut;
    return { id: it.id, payable, covered: Math.min(payable, Math.max(paidByItem[it.id] ?? 0, 0)) };
  });
  let left = Math.max(generalPaid, 0);
  for (const r of rows) {
    const take = Math.min(r.payable - r.covered, left);
    r.covered += take;
    left -= take;
  }
  return new Map(rows.map((r) => [r.id, { payable: r.payable, covered: r.covered, balance: r.payable - r.covered, status: (r.covered >= r.payable ? "paid" : r.covered > 0 ? "partial" : "unpaid") as "paid" | "partial" | "unpaid" }]));
}

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

export type Purpose = "rent" | "expense";
export const PURPOSE_LABEL: Record<Purpose, string> = { rent: "Rent", expense: "Expenses" };
export const purposeLabel = (p: string) => PURPOSE_LABEL[p as Purpose] ?? "Rent";

/**
 * Splits one bill into RENT and EXPENSES (electricity, water, gas cylinder, other charges) and says how much of each is paid.
 * Rent and expenses are PAID SEPARATELY: `paid.rent` is what was paid toward rent, `paid.expense` toward expenses.
 * Discounts come off rent first. `pending` = payments the tenant reported but the owner hasn't confirmed, per purpose.
 */
export function splitRentExpense(
  parts: { rent: number; other: number; adjustment: number },
  paid: { rent: number; expense: number },
  pending: { rent: number; expense: number } = { rent: 0, expense: 0 },
) {
  let discount = Math.max(-parts.adjustment, 0);
  const rentOff = Math.min(parts.rent, discount);
  discount -= rentOff;
  const rentPayable = parts.rent - rentOff;
  const expensePayable = Math.max(parts.other - discount, 0);
  const rentCovered = Math.min(rentPayable, Math.max(paid.rent, 0));
  const expenseCovered = Math.min(expensePayable, Math.max(paid.expense, 0));
  const rentBalance = rentPayable - rentCovered;
  const expenseBalance = expensePayable - expenseCovered;
  const pendingRent = Math.min(Math.max(pending.rent, 0), rentBalance);
  const pendingExpense = Math.min(Math.max(pending.expense, 0), expenseBalance);
  return { rentPayable, rentCovered, rentBalance, pendingRent, expensePayable, expenseCovered, expenseBalance, pendingExpense };
}

/**
 * For reports: which categories a payment's money belongs to. A RENT payment is all rent; an EXPENSE payment is spread over the
 * expense lines in order (electricity → water → other). `alreadyAllocated` is what earlier payments of the same purpose took.
 */
export function allocatePayment(
  items: { kind: string; amountPaise: number }[],
  purpose: Purpose,
  amount: number,
  alreadyAllocated: Record<Cat, number>,
): Record<Cat, number> {
  const out: Record<Cat, number> = { rent: 0, electricity: 0, water: 0, other: 0 };
  if (purpose === "rent") {
    out.rent = amount;
    return out;
  }
  const net: Record<"electricity" | "water" | "other", number> = { electricity: 0, water: 0, other: 0 };
  for (const it of items) if (it.kind === "electricity" || it.kind === "water" || it.kind === "other") net[it.kind] += it.amountPaise;
  let left = amount;
  for (const c of ["electricity", "water", "other"] as const) {
    const take = Math.min(Math.max(net[c] - alreadyAllocated[c], 0), left);
    out[c] = take;
    left -= take;
  }
  out.other += left; // anything beyond the lines (e.g. a discount applied later) stays under expenses
  return out;
}
