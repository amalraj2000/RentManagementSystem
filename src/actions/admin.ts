"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { run, fd } from "@/lib/action";
import { requireAdmin } from "@/lib/session";
import * as S from "@/lib/schemas";
import { addInvoiceItem, recordPayment, syncInvoices, voidPayment } from "@/services/billing";
import { addExpense, deleteAnnouncement, deleteExpense, postAnnouncement, updateSettings } from "@/services/misc";
import { createTenant, deleteTenant, moveOutTenant, moveTenantToBed, resetTenantPassword, setTenantLoginActive, updateTenant } from "@/services/tenants";
import { createUtilityBill, deleteUtilityBill } from "@/services/utilities";

const tenantFields = {
  name: S.text(100).min(2, "Enter the tenant's name"),
  email: S.email,
  phone: S.phone,
  joiningDate: S.date,
  monthlyRent: S.nonNegMoney,
  deposit: S.nonNegMoney,
  emergencyContactName: S.optText(100),
  emergencyContactPhone: S.optText(20),
  notes: S.optText(500),
};
const toInput = (d: z.infer<z.ZodObject<typeof tenantFields>>) => ({
  name: d.name,
  email: d.email,
  phone: d.phone,
  joiningDate: d.joiningDate,
  monthlyRentPaise: d.monthlyRent,
  securityDepositPaise: d.deposit,
  emergencyContactName: d.emergencyContactName,
  emergencyContactPhone: d.emergencyContactPhone,
  notes: d.notes,
});

export async function addTenantAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ ...tenantFields, password: z.string().max(128), bedId: z.string().optional() }).parse(fd(f));
    await createTenant(getDb(), me.id, { ...toInput(d), password: d.password, bedId: d.bedId || null });
    revalidatePath("/admin", "layout");
    return "Tenant added. Share the temporary password securely — they must change it on first login.";
  });
}

export async function updateTenantAction(tenantId: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ ...tenantFields, status: z.enum(["active", "notice", "moved_out"]) }).parse(fd(f));
    await updateTenant(getDb(), me.id, S.id.parse(tenantId), { ...toInput(d), status: d.status });
    revalidatePath("/admin", "layout");
    return "Tenant updated";
  });
}

export async function moveBedAction(tenantId: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ bedId: z.string().optional(), date: S.date }).parse(fd(f));
    await moveTenantToBed(getDb(), me.id, S.id.parse(tenantId), d.bedId || null, d.date);
    revalidatePath("/admin", "layout");
    return "Bed updated";
  });
}

export async function moveOutAction(tenantId: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ date: S.date }).parse(fd(f));
    await moveOutTenant(getDb(), me.id, S.id.parse(tenantId), d.date);
    revalidatePath("/admin", "layout");
    return "Tenant moved out. Invoices and payments are preserved.";
  });
}

export async function toggleLoginAction(tenantId: string, active: boolean) {
  return run(async () => {
    const me = await requireAdmin();
    await setTenantLoginActive(getDb(), me.id, S.id.parse(tenantId), active);
    revalidatePath("/admin", "layout");
    return active ? "Login enabled" : "Login disabled";
  });
}

export async function resetPasswordAction(tenantId: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ password: z.string().max(128) }).parse(fd(f));
    await resetTenantPassword(getDb(), me.id, S.id.parse(tenantId), d.password);
    return "Password reset. They must change it on next login.";
  });
}

export async function deleteTenantAction(tenantId: string) {
  return run(async () => {
    const me = await requireAdmin();
    await deleteTenant(getDb(), me.id, S.id.parse(tenantId));
    revalidatePath("/admin", "layout");
    return "Tenant deleted";
  });
}

export async function generateInvoicesAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ month: S.month }).parse(fd(f));
    const r = await syncInvoices(getDb(), me.id, d.month);
    revalidatePath("/admin", "layout");
    return r.total === 0 ? "No eligible tenants for that month" : `${r.created} invoice(s) created, existing ones left untouched`;
  });
}

export async function recordPaymentAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z
      .object({
        invoiceId: S.id,
        amount: S.positiveMoney,
        paidOn: S.date,
        method: z.enum(["cash", "upi", "bank_transfer", "other"]),
        reference: S.optText(100),
        note: S.optText(200),
      })
      .parse(fd(f));
    const r = await recordPayment(getDb(), me.id, { invoiceId: d.invoiceId, amountPaise: d.amount, paidOn: d.paidOn, method: d.method, reference: d.reference, note: d.note });
    revalidatePath("/admin", "layout");
    return `Payment recorded · receipt ${r.receiptNo}`;
  });
}

export async function voidPaymentAction(paymentId: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ reason: S.text(200).min(3, "Enter a reason") }).parse(fd(f));
    await voidPayment(getDb(), me.id, S.id.parse(paymentId), d.reason);
    revalidatePath("/admin", "layout");
    return "Payment voided";
  });
}

export async function addInvoiceItemAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ invoiceId: S.id, kind: z.enum(["other", "adjustment"]), description: S.text(200).min(3, "Enter a reason"), amount: S.positiveMoney }).parse(fd(f));
    await addInvoiceItem(getDb(), me.id, d.invoiceId, d.kind, d.description, d.amount);
    revalidatePath("/admin", "layout");
    return d.kind === "adjustment" ? "Discount applied" : "Charge added";
  });
}

export async function createUtilityAction(type: "electricity" | "water", f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const raw = fd(f);
    const d = z
      .object({
        periodMonth: S.month,
        total: S.positiveMoney,
        method: z.enum(["equal_residents", "equal_beds", "custom"]),
        billDate: S.date,
        dueDate: S.date,
        openingReading: S.optInt,
        closingReading: S.optInt,
        attachmentRef: S.optText(300),
        notes: S.optText(300),
      })
      .parse(raw);
    const custom: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("custom_") && String(v).trim()) custom[k.slice(7)] = S.money.parse(String(v));
    }
    await createUtilityBill(getDb(), me.id, {
      type,
      periodMonth: d.periodMonth,
      totalPaise: d.total,
      method: d.method,
      billDate: d.billDate,
      dueDate: d.dueDate,
      openingReading: d.openingReading,
      closingReading: d.closingReading,
      attachmentRef: d.attachmentRef,
      notes: d.notes,
      custom,
    });
    revalidatePath("/admin", "layout");
    return `${type === "electricity" ? "Electricity" : "Water"} bill saved and added to invoices`;
  });
}

export async function deleteUtilityAction(id: string) {
  return run(async () => {
    const me = await requireAdmin();
    await deleteUtilityBill(getDb(), me.id, S.id.parse(id));
    revalidatePath("/admin", "layout");
    return "Bill deleted";
  });
}

export async function addExpenseAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z
      .object({
        category: z.enum(["electricity", "water", "cleaning", "repairs", "internet", "other"]),
        amount: S.positiveMoney,
        spentOn: S.date,
        description: S.text(200).min(2, "Add a short description"),
        receiptRef: S.optText(300),
      })
      .parse(fd(f));
    await addExpense(getDb(), me.id, { category: d.category, amountPaise: d.amount, spentOn: d.spentOn, description: d.description, receiptRef: d.receiptRef });
    revalidatePath("/admin", "layout");
    return "Expense recorded";
  });
}

export async function deleteExpenseAction(id: string) {
  return run(async () => {
    const me = await requireAdmin();
    await deleteExpense(getDb(), me.id, S.id.parse(id));
    revalidatePath("/admin", "layout");
    return "Expense deleted";
  });
}

export async function postAnnouncementAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ title: S.text(120).min(2, "Add a title"), body: S.text(2000).min(2, "Write the notice"), pinned: z.string().optional() }).parse(fd(f));
    await postAnnouncement(getDb(), me.id, { title: d.title, body: d.body, pinned: d.pinned === "on" });
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return "Notice posted";
  });
}

export async function deleteAnnouncementAction(id: string) {
  return run(async () => {
    const me = await requireAdmin();
    await deleteAnnouncement(getDb(), me.id, S.id.parse(id));
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return "Notice deleted";
  });
}

export async function updateSettingsAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z
      .object({
        defaultRent: S.nonNegMoney,
        dueDay: z.coerce.number().int().min(1).max(28),
        electricityMethod: z.enum(["equal_residents", "equal_beds", "custom"]),
        waterMethod: z.enum(["equal_residents", "custom"]),
        houseRules: S.text(4000),
        contactInfo: S.text(2000),
      })
      .parse(fd(f));
    await updateSettings(getDb(), me.id, { defaultRentPaise: d.defaultRent, dueDayOfMonth: d.dueDay, electricityMethod: d.electricityMethod, waterMethod: d.waterMethod, houseRules: d.houseRules, contactInfo: d.contactInfo });
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return "Settings saved";
  });
}
