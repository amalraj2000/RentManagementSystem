import { eq, inArray } from "drizzle-orm";
import { expenseAllocations, expenses, invoiceItems, invoices } from "@/db/schema";
import { allocateUtility } from "@/lib/billing";
import { AppError, recomputeInvoice, type Q } from "./common";
import { eligibleTenants, syncInvoicesTx } from "./billing";

export type ShareInput = { mode: "none" | "equal" | "custom"; custom?: Record<string, number> };
type ExpenseRow = { id: string; category: string; description: string; amountPaise: number; spentOn: string; shareMode: "none" | "equal" | "custom" };

/** Removes the tenant charges created for an expense. Blocked if any affected invoice already has payments. */
export async function removeShares(tx: Q, expenseId: string) {
  const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.expenseId, expenseId));
  if (items.length) {
    const invs = await tx.select().from(invoices).where(inArray(invoices.id, items.map((i) => i.invoiceId)));
    if (invs.some((i) => i.paidPaise > 0)) throw new AppError("Payments were already recorded on invoices that include this shared expense. Void those payments first.", "shareMode");
    await tx.delete(invoiceItems).where(eq(invoiceItems.expenseId, expenseId));
    for (const i of invs) await recomputeInvoice(tx, i.id);
  }
  await tx.delete(expenseAllocations).where(eq(expenseAllocations.expenseId, expenseId));
}

/**
 * Splits an expense across the tenants who were active in the expense's month and adds each share to
 * that tenant's invoice as an "other" charge (so it shows in their dashboard and bill). Idempotent:
 * unchanged input does nothing; changed input rebuilds the shares cleanly.
 *  - equal:  the full amount, split equally (shares add up exactly)
 *  - custom: the amounts you enter per tenant; they may total less than the expense (you bear the rest)
 */
export async function applyShare(tx: Q, actorId: string, exp: ExpenseRow, prev: ExpenseRow | null, share: ShareInput) {
  const month = exp.spentOn.slice(0, 7);
  if (share.mode === "none") {
    if (prev && prev.shareMode !== "none") {
      await removeShares(tx, exp.id);
      await tx.update(expenses).set({ shareMode: "none" }).where(eq(expenses.id, exp.id));
    }
    return;
  }
  const eligible = await eligibleTenants(tx, month);
  const ids = eligible.map((t) => t.id);
  let shares: { tenantId: string; amountPaise: number }[];
  try {
    if (share.mode === "equal") {
      shares = allocateUtility(exp.amountPaise, "equal_residents", ids, []);
    } else {
      const entries = Object.entries(share.custom ?? {}).filter(([, v]) => v > 0);
      if (!entries.length) throw new Error("Enter an amount for at least one tenant");
      for (const [tid] of entries) if (!ids.includes(tid)) throw new Error("A tenant you entered was not living here in that month");
      const sum = entries.reduce((a, [, v]) => a + v, 0);
      if (sum > exp.amountPaise) throw new Error(`The tenant amounts (₹${(sum / 100).toFixed(2)}) are more than the expense (₹${(exp.amountPaise / 100).toFixed(2)})`);
      shares = entries.map(([tenantId, amountPaise]) => ({ tenantId, amountPaise }));
    }
  } catch (e) {
    throw new AppError((e as Error).message, "shareMode");
  }
  const existing = await tx.select().from(expenseAllocations).where(eq(expenseAllocations.expenseId, exp.id));
  const same =
    prev &&
    prev.shareMode === share.mode &&
    prev.description === exp.description &&
    prev.category === exp.category &&
    prev.amountPaise === exp.amountPaise &&
    prev.spentOn.slice(0, 7) === month &&
    existing.length === shares.length &&
    shares.every((s) => existing.find((e) => e.tenantId === s.tenantId)?.amountPaise === s.amountPaise);
  if (same) return;
  await removeShares(tx, exp.id);
  await tx.insert(expenseAllocations).values(shares.map((s) => ({ expenseId: exp.id, tenantId: s.tenantId, amountPaise: s.amountPaise })));
  await tx.update(expenses).set({ shareMode: share.mode }).where(eq(expenses.id, exp.id));
  await syncInvoicesTx(tx, actorId, month);
}
