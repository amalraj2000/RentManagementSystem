import { and, eq, inArray, isNull } from "drizzle-orm";
import { expenseLineSettlement } from "@/lib/billing";
import { invoiceItems, paymentClaims, payments } from "@/db/schema";
import type { Q } from "./common";

/**
 * How much of EACH expense line of the given bills is paid / waiting. Every expense is paid on its own: a payment made for one
 * line never pays another. Returns, per bill, a map of line id → { payable, covered, balance, pending, status }.
 */
export async function expenseLinesFor(q: Q, invoiceIds: string[]) {
  const out = new Map<string, Map<string, { payable: number; covered: number; balance: number; pending: number; status: "paid" | "partial" | "unpaid" }>>();
  if (!invoiceIds.length) return out;
  const [items, pays, claims] = await Promise.all([
    q.select({ id: invoiceItems.id, invoiceId: invoiceItems.invoiceId, kind: invoiceItems.kind, amountPaise: invoiceItems.amountPaise }).from(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds)),
    q.select({ invoiceId: payments.invoiceId, itemId: payments.invoiceItemId, amountPaise: payments.amountPaise }).from(payments).where(and(inArray(payments.invoiceId, invoiceIds), eq(payments.purpose, "expense"), isNull(payments.voidedAt))),
    q.select({ invoiceId: paymentClaims.invoiceId, itemId: paymentClaims.invoiceItemId, amountPaise: paymentClaims.amountPaise }).from(paymentClaims).where(and(inArray(paymentClaims.invoiceId, invoiceIds), eq(paymentClaims.purpose, "expense"), eq(paymentClaims.status, "pending"))),
  ]);
  for (const id of invoiceIds) {
    const its = items.filter((i) => i.invoiceId === id);
    const known = new Set(its.map((i) => i.id));
    const rent = its.filter((i) => i.kind === "rent").reduce((a, i) => a + i.amountPaise, 0);
    const disc = its.filter((i) => i.amountPaise < 0).reduce((a, i) => a - i.amountPaise, 0);
    const byItem: Record<string, number> = {};
    let general = 0;
    for (const p of pays.filter((x) => x.invoiceId === id)) {
      if (p.itemId && known.has(p.itemId)) byItem[p.itemId] = (byItem[p.itemId] ?? 0) + p.amountPaise;
      else general += p.amountPaise;
    }
    const settled = expenseLineSettlement(its, byItem, general, Math.max(disc - rent, 0)); // a discount only reaches expenses once rent is fully discounted
    const pendingBy: Record<string, number> = {};
    let pendingGeneral = 0;
    for (const c of claims.filter((x) => x.invoiceId === id)) {
      if (c.itemId && known.has(c.itemId)) pendingBy[c.itemId] = (pendingBy[c.itemId] ?? 0) + c.amountPaise;
      else pendingGeneral += c.amountPaise;
    }
    const m = new Map<string, { payable: number; covered: number; balance: number; pending: number; status: "paid" | "partial" | "unpaid" }>();
    for (const [lineId, v] of settled) {
      const gen = Math.min(pendingGeneral, Math.max(v.balance - (pendingBy[lineId] ?? 0), 0)); // an old, untargeted report counts against the first lines
      pendingGeneral -= gen;
      m.set(lineId, { ...v, pending: Math.min((pendingBy[lineId] ?? 0) + gen, v.balance) });
    }
    out.set(id, m);
  }
  return out;
}
