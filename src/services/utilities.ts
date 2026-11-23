import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { expenses, invoiceItems, invoices, utilityAllocations, utilityBills } from "@/db/schema";
import { allocateUtility, unitsFromReadings, type Method } from "@/lib/billing";
import { monthLabel } from "@/lib/dates";
import { AppError, audit, recomputeInvoice } from "./common";
import { bedHoldersForMonth, eligibleTenants, syncInvoicesTx } from "./billing";

export type UtilityInput = {
  type: "electricity" | "water";
  periodMonth: string;
  totalPaise: number;
  method: Method;
  billDate: string;
  dueDate: string;
  openingReading?: number | null;
  closingReading?: number | null;
  attachmentRef?: string | null;
  notes?: string | null;
  custom?: Record<string, number>;
};

/**
 * Creates the bill, saves an immutable allocation snapshot, mirrors it as an expense
 * (so it is counted once in reports) and attaches the shares to that month's invoices.
 * One bill per (type, month) — enforced by a unique index as well.
 */
export async function createUtilityBill(db: DB, actorId: string, input: UtilityInput) {
  if (input.type === "water" && input.method === "equal_beds") throw new AppError("Water supports equal split or custom amounts");
  if (!Number.isInteger(input.totalPaise) || input.totalPaise <= 0) throw new AppError("Total must be greater than zero");
  let units: number | null;
  try {
    units = unitsFromReadings(input.openingReading, input.closingReading);
  } catch (e) {
    throw new AppError((e as Error).message);
  }
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: utilityBills.id, m: utilityBills.periodMonth }).from(utilityBills).where(eq(utilityBills.type, input.type));
    if (existing.some((e) => e.m === input.periodMonth))
      throw new AppError(`A ${input.type} bill for ${monthLabel(input.periodMonth)} already exists`);

    const eligible = await eligibleTenants(tx, input.periodMonth);
    const residentIds = eligible.map((t) => t.id);
    const bedHolders = await bedHoldersForMonth(tx, input.periodMonth, residentIds);
    let shares;
    try {
      shares = allocateUtility(input.totalPaise, input.method, residentIds, bedHolders, input.custom);
    } catch (e) {
      throw new AppError((e as Error).message);
    }

    const [bill] = await tx
      .insert(utilityBills)
      .values({
        type: input.type,
        periodMonth: input.periodMonth,
        totalPaise: input.totalPaise,
        allocationMethod: input.method,
        billDate: input.billDate,
        dueDate: input.dueDate,
        openingReading: input.openingReading ?? null,
        closingReading: input.closingReading ?? null,
        unitsConsumed: units,
        attachmentRef: input.attachmentRef || null,
        notes: input.notes || null,
        createdBy: actorId,
      })
      .returning({ id: utilityBills.id });
    await tx.insert(utilityAllocations).values(shares.map((s) => ({ utilityBillId: bill.id, tenantId: s.tenantId, amountPaise: s.amountPaise })));
    await tx.insert(expenses).values({
      category: input.type,
      amountPaise: input.totalPaise,
      spentOn: input.billDate,
      description: `${input.type === "electricity" ? "Electricity" : "Water"} bill – ${monthLabel(input.periodMonth)}`,
      receiptRef: input.attachmentRef || null,
      utilityBillId: bill.id,
      createdBy: actorId,
    });
    // Attach to invoices (creates invoices for the month if needed).
    await syncInvoicesTx(tx, actorId, input.periodMonth);
    await audit(tx, actorId, "utility.create", "utility_bill", bill.id, { type: input.type, month: input.periodMonth, total: input.totalPaise, method: input.method });
    return bill.id;
  });
}

/** Allowed only while none of the affected invoices has a payment. */
export async function deleteUtilityBill(db: DB, actorId: string, billId: string) {
  await db.transaction(async (tx) => {
    const [bill] = await tx.select().from(utilityBills).where(eq(utilityBills.id, billId));
    if (!bill) throw new AppError("Bill not found");
    const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.utilityBillId, billId));
    const invs = items.length ? await tx.select().from(invoices).where(inArray(invoices.id, items.map((i) => i.invoiceId))) : [];
    if (invs.some((i) => i.paidPaise > 0)) throw new AppError("Payments exist on invoices containing this bill. Void them first.");
    await tx.delete(invoiceItems).where(eq(invoiceItems.utilityBillId, billId));
    for (const i of invs) await recomputeInvoice(tx, i.id);
    await tx.delete(expenses).where(eq(expenses.utilityBillId, billId));
    await tx.delete(utilityAllocations).where(eq(utilityAllocations.utilityBillId, billId));
    await tx.delete(utilityBills).where(eq(utilityBills.id, billId));
    await audit(tx, actorId, "utility.delete", "utility_bill", billId, { type: bill.type, month: bill.periodMonth });
  });
}
