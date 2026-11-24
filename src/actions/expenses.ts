"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { run, fd } from "@/lib/action";
import { requireAdmin, requireTenantWrite } from "@/lib/session";
import * as S from "@/lib/schemas";
import { createExpense, deleteExpense, markSharePaid, reportSharePaid, revertSharePaid, updateExpense } from "@/services/expenses";

const expenseSchema = z.object({ title: S.text(120).min(2, "Enter what the expense is for"), amount: S.positiveMoney, expenseDate: S.date, note: S.optText(500) });
const refresh = () => {
  revalidatePath("/admin", "layout");
  revalidatePath("/portal", "layout");
};

export async function addExpenseAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = expenseSchema.parse(fd(f));
    await createExpense(getDb(), me.id, { title: d.title, note: d.note, amountPaise: d.amount, expenseDate: d.expenseDate });
    refresh();
    return "Expense added and shared between the active tenants.";
  });
}

export async function updateExpenseAction(id: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = expenseSchema.parse(fd(f));
    await updateExpense(getDb(), me.id, S.id.parse(id), { title: d.title, note: d.note, amountPaise: d.amount, expenseDate: d.expenseDate });
    refresh();
    return "Expense updated";
  });
}

export async function deleteExpenseAction(id: string) {
  return run(async () => {
    const me = await requireAdmin();
    await deleteExpense(getDb(), me.id, S.id.parse(id));
    refresh();
    return "Expense deleted";
  });
}

/** Owner marks a tenant's share as paid (also confirms a payment the tenant reported). */
export async function markSharePaidAction(shareId: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ method: z.enum(["cash", "upi"]).default("cash") }).parse(fd(f));
    await markSharePaid(getDb(), me.id, S.id.parse(shareId), d.method);
    refresh();
    return "Marked as paid";
  });
}

export async function revertShareAction(shareId: string) {
  return run(async () => {
    const me = await requireAdmin();
    await revertSharePaid(getDb(), me.id, S.id.parse(shareId));
    refresh();
    return "Back to due";
  });
}

/** Tenant: "I have paid my share" — waits for the owner to confirm. */
export async function reportExpensePaidAction(shareId: string, f: FormData) {
  return run(async () => {
    const me = await requireTenantWrite();
    const d = z.object({ method: z.enum(["cash", "upi"]) }).parse(fd(f));
    await reportSharePaid(getDb(), me.id, S.id.parse(shareId), d.method);
    refresh();
    return "Sent! The owner will confirm your payment soon.";
  });
}
