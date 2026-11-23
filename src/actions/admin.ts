"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { run, fd } from "@/lib/action";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { formatINR } from "@/lib/money";
import { requireAdmin } from "@/lib/session";
import * as S from "@/lib/schemas";
import { addInvoiceItem, deleteInvoice, markPaid, recordPayment, syncInvoices, updatePaymentDetails, voidPayment } from "@/services/billing";
import { addExpense, deleteAnnouncement, deleteExpense, postAnnouncement, updateAnnouncement, updateExpense, updateSettings } from "@/services/misc";
import { createTenant, deleteTenant, revertVacate, vacateTenant, moveTenantToBed, resetTenantPassword, setTenantLoginActive, updateTenant } from "@/services/tenants";
import { createAdminUser, deleteAdminUser, resetAdminPassword, setAdminActive, updateAdminUser } from "@/services/admins";
import { createRoom, deleteRoom, updateRoom } from "@/services/rooms";
import { approveClaim, rejectClaim } from "@/services/claims";
import { collectDues } from "@/services/collect";
import { addSitePhoto, deleteSitePhoto, setFacilities, updateWebsiteInfo } from "@/services/website";
import { whatsappNumber } from "@/lib/share";
import { generateTempPassword, loginMessage, whatsappLink } from "@/lib/share";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { beds, tenantProfiles, users } from "@/db/schema";
import { ROOM_ADD_DELETE_ENABLED } from "@/lib/features";
import { deleteDocument, uploadDocument, validateFile } from "@/services/documents";
import { AppError } from "@/services/common";
import { createUtilityBill, deleteUtilityBill, updateUtilityDetails } from "@/services/utilities";

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

const fileOf = (f: FormData, name: string) => {
  const v = f.get(name);
  return v instanceof File && v.size > 0 ? v : null;
};

export async function addTenantAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ ...tenantFields, password: z.string().max(128), bedId: z.string().optional(), idType: z.string().optional() }).parse(fd(f));
    // Validate files first so a bad upload never leaves a half-created tenant.
    const photoFile = fileOf(f, "photo");
    const idFile = fileOf(f, "idProof");
    const photo = photoFile ? await validateFile(photoFile, "photo", "photo") : null;
    const idProof = idFile ? { file: await validateFile(idFile, "id_proof", "idProof"), idType: d.idType } : null;
    await createTenant(getDb(), me.id, { ...toInput(d), password: d.password, bedId: d.bedId || null, photo, idProof });
    revalidatePath("/admin", "layout");
    return "Tenant added. Share the temporary password securely — they must change it on first login.";
  });
}

export async function uploadDocumentAction(tenantId: string, kind: "photo" | "id_proof", f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const file = fileOf(f, "file");
    if (!file) throw new AppError("Choose a file first", "file");
    const d = z.object({ idType: z.string().optional() }).parse(fd(f));
    await uploadDocument(getDb(), me.id, S.id.parse(tenantId), z.enum(["photo", "id_proof"]).parse(kind), file, d.idType);
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return kind === "photo" ? "Photo saved" : "ID document added";
  });
}

export async function deleteDocumentAction(id: string) {
  return run(async () => {
    const me = await requireAdmin();
    await deleteDocument(getDb(), me.id, S.id.parse(id));
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return "File deleted";
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

export async function vacateAction(tenantId: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ date: S.date }).parse(fd(f));
    await vacateTenant(getDb(), me.id, S.id.parse(tenantId), d.date);
    revalidatePath("/admin", "layout");
    return "Tenant vacated. Invoices and payments are preserved.";
  });
}

export async function revertVacateAction(tenantId: string) {
  return run(async () => {
    const me = await requireAdmin();
    const r = await revertVacate(getDb(), me.id, S.id.parse(tenantId));
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return r.bedBack ? "Vacate undone. Their old bed is back with them." : "Vacate undone. Their old bed is taken, so assign a bed on their page.";
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
        purpose: z.enum(["rent", "expense"]).default("rent"),
        amount: S.positiveMoney,
        paidOn: S.date,
        method: z.enum(["cash", "upi", "bank_transfer", "other"]),
        reference: S.optText(100),
        note: S.optText(200),
      })
      .parse(fd(f));
    const r = await recordPayment(getDb(), me.id, { invoiceId: d.invoiceId, purpose: d.purpose, amountPaise: d.amount, paidOn: d.paidOn, method: d.method, reference: d.reference, note: d.note });
    revalidatePath("/admin", "layout");
    return `Payment recorded · receipt ${r.receiptNo}`;
  });
}

/** "This has been paid": records the whole remaining rent (`target` = "rent") or ONE expense line (`target` = its id) as paid today. */
export async function markPaidAction(invoiceId: string, target: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ method: z.enum(["upi", "cash"]) }).parse(fd(f));
    const r = await markPaid(getDb(), me.id, { invoiceId: S.id.parse(invoiceId), itemId: target === "rent" ? null : S.id.parse(target), method: d.method });
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return `Marked as paid · receipt ${r.receiptNo}`;
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

const expenseShape = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: S.positiveMoney,
  spentOn: S.date,
  description: S.text(200),
  receiptRef: S.optText(300),
  shareMode: z.enum(["none", "equal", "custom"]).default("equal"), // default: split among the active tenants
});

export async function addExpenseAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const img = fileOf(f, "receipt");
    const receipt = img ? await validateFile(img, "photo", "receipt") : null;
    const d = expenseShape.parse(fd(f));
    await addExpense(getDb(), me.id, { category: d.category, amountPaise: d.amount, spentOn: d.spentOn, description: d.description, receiptRef: d.receiptRef, receipt, share: shareFrom(fd(f), d.shareMode) });
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return d.shareMode === "none" ? "Expense recorded" : "Expense recorded and shared with tenants";
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

export async function createAdminAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ name: S.text(100).min(2, "Enter a name"), email: S.email, password: z.string().max(128) }).parse(fd(f));
    await createAdminUser(getDb(), me.id, d);
    revalidatePath("/admin/admins");
    return "Admin created. Share the temporary password securely.";
  });
}

export async function toggleAdminAction(id: string, active: boolean) {
  return run(async () => {
    const me = await requireAdmin();
    await setAdminActive(getDb(), me.id, S.id.parse(id), active);
    revalidatePath("/admin/admins");
    return active ? "Admin enabled" : "Admin disabled";
  });
}

export async function resetAdminPasswordAction(id: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ password: z.string().max(128) }).parse(fd(f));
    await resetAdminPassword(getDb(), me.id, S.id.parse(id), d.password);
    return "Password reset. They must change it on next login.";
  });
}

export async function updateAdminAction(id: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ name: S.text(100).min(2, "Enter a name"), email: S.email }).parse(fd(f));
    await updateAdminUser(getDb(), me.id, S.id.parse(id), d);
    revalidatePath("/admin", "layout");
    return "Admin updated";
  });
}

export async function deleteAdminAction(id: string) {
  return run(async () => {
    const me = await requireAdmin();
    await deleteAdminUser(getDb(), me.id, S.id.parse(id));
    revalidatePath("/admin/admins");
    return "Admin deleted";
  });
}

/** Reads the per-tenant amounts from share_<tenantId> inputs. */
function shareFrom(raw: Record<string, FormDataEntryValue>, mode: "none" | "equal" | "custom") {
  const custom: Record<string, number> = {};
  if (mode === "custom") {
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("share_") && String(v).trim()) custom[k.slice(6)] = S.money.parse(String(v));
    }
  }
  return { mode, custom };
}

export async function updateExpenseAction(id: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = expenseShape.parse(fd(f));
    const img = fileOf(f, "receipt");
    const receipt = img ? await validateFile(img, "photo", "receipt") : null;
    await updateExpense(getDb(), me.id, S.id.parse(id), { category: d.category, amountPaise: d.amount, spentOn: d.spentOn, description: d.description, receiptRef: d.receiptRef, receipt, removeReceipt: f.get("removeReceipt") === "on", share: shareFrom(fd(f), d.shareMode) });
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return "Expense updated";
  });
}

export async function updateAnnouncementAction(id: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ title: S.text(120).min(2, "Add a title"), body: S.text(2000).min(2, "Write the notice"), pinned: z.string().optional() }).parse(fd(f));
    await updateAnnouncement(getDb(), me.id, S.id.parse(id), { title: d.title, body: d.body, pinned: d.pinned === "on" });
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return "Notice updated";
  });
}

export async function updatePaymentAction(id: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ paidOn: S.date, method: z.enum(["cash", "upi", "bank_transfer", "other"]), reference: S.optText(100), note: S.optText(200) }).parse(fd(f));
    await updatePaymentDetails(getDb(), me.id, S.id.parse(id), d);
    revalidatePath("/admin", "layout");
    return "Payment updated";
  });
}

export async function updateUtilityAction(id: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ billDate: S.date, dueDate: S.date, openingReading: S.optInt, closingReading: S.optInt, attachmentRef: S.optText(300), notes: S.optText(300) }).parse(fd(f));
    await updateUtilityDetails(getDb(), me.id, S.id.parse(id), d);
    revalidatePath("/admin", "layout");
    return "Bill updated";
  });
}

export async function deleteInvoiceAction(id: string) {
  return run(async () => {
    const me = await requireAdmin();
    await deleteInvoice(getDb(), me.id, S.id.parse(id));
    revalidatePath("/admin", "layout");
    return "Invoice deleted";
  });
}

const roomShape = z.object({
  name: S.text(60).min(1, "Enter a room name"),
  bedCount: z.coerce.number().int().min(1, "A room needs at least 1 bed").max(4, "A room can have at most 4 beds"),
  bathroom: z.string().optional(),
});

export async function createRoomAction(f: FormData) {
  return run(async () => {
    if (!ROOM_ADD_DELETE_ENABLED) throw new AppError("Adding rooms is switched off.");
    const me = await requireAdmin();
    const d = roomShape.parse(fd(f));
    await createRoom(getDb(), me.id, { name: d.name, bedCount: d.bedCount, hasAttachedBathroom: d.bathroom === "on" });
    revalidatePath("/admin", "layout");
    return "Room added";
  });
}

export async function updateRoomAction(id: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = roomShape.parse(fd(f));
    if (!ROOM_ADD_DELETE_ENABLED) {
      // beds can not be added or removed: whatever was posted, keep the room's current number of beds
      const [{ n }] = await getDb().select({ n: sql<number>`count(*)` }).from(beds).where(eq(beds.roomId, S.id.parse(id)));
      d.bedCount = Number(n);
    }
    await updateRoom(getDb(), me.id, S.id.parse(id), { name: d.name, bedCount: d.bedCount, hasAttachedBathroom: d.bathroom === "on" });
    revalidatePath("/admin", "layout");
    return "Room updated";
  });
}

export async function deleteRoomAction(id: string) {
  return run(async () => {
    if (!ROOM_ADD_DELETE_ENABLED) throw new AppError("Deleting rooms is switched off.");
    const me = await requireAdmin();
    const r = await deleteRoom(getDb(), me.id, S.id.parse(id));
    revalidatePath("/admin", "layout");
    revalidatePath("/");
    return r.archived ? "Room removed. Its bed history is kept." : "Room deleted";
  });
}


export async function approveClaimAction(id: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ amount: S.positiveMoney }).parse(fd(f));
    await approveClaim(getDb(), me.id, S.id.parse(id), d.amount);
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return "Payment confirmed and recorded";
  });
}

export async function rejectClaimAction(id: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z.object({ reason: S.text(200).min(3, "Give a short reason") }).parse(fd(f));
    await rejectClaim(getDb(), me.id, S.id.parse(id), d.reason);
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return "Report rejected — the tenant was notified";
  });
}

/**
 * "Share login on WhatsApp". Passwords are stored hashed, so an existing one can't be read back:
 * this sets a NEW random temporary password (tenant must change it at first login, other sessions are logged out)
 * and returns it ONCE, with a ready-made WhatsApp link. Nothing is stored in plain text.
 */
export async function shareLoginAction(tenantId: string) {
  return run(async () => {
    const me = await requireAdmin();
    const db = getDb();
    const id = S.id.parse(tenantId);
    const [t] = await db.select({ name: users.name, email: users.email, phone: tenantProfiles.phone, status: tenantProfiles.status, active: users.isActive }).from(tenantProfiles).innerJoin(users, eq(users.id, tenantProfiles.userId)).where(eq(tenantProfiles.id, id));
    if (!t) throw new AppError("Tenant not found");
    if (t.status === "moved_out") throw new AppError("This tenant has vacated, so there is no login to share");
    if (!t.active) throw new AppError("This tenant's login is disabled. Enable it first.");
    const password = generateTempPassword();
    await resetTenantPassword(db, me.id, id, password);
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    const base = process.env.APP_URL && !process.env.APP_URL.includes("localhost") ? process.env.APP_URL : host ? `${proto}://${host}` : process.env.APP_URL ?? "";
    const url = `${base.replace(/\/$/, "")}/login`;
    const message = loginMessage({ name: t.name, url, email: t.email, password });
    revalidatePath("/admin", "layout");
    return { message: "New temporary password created", data: { whatsapp: whatsappLink(t.phone, message), message, name: t.name, email: t.email, password, url } };
  });
}

const optPhone = z.string().trim().max(20).refine((v) => !v || /^[+\d][\d\s-]{6,17}$/.test(v), "Enter a valid mobile number");

export async function updateWebsiteAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z
      .object({
        pgName: S.text(60).min(2, "Enter the name of your PG"),
        tagline: S.text(120),
        about: S.text(1000),
        address: S.text(300),
        contactPhone: optPhone,
        whatsapp: optPhone.refine((v) => !v || whatsappNumber(v) !== null, "Enter a valid WhatsApp number"),
        contactEmail: z.string().trim().max(200).refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email address"),
        mapsLink: z.string().trim().max(500).refine((v) => !v || /^https:\/\//i.test(v), "The map link must start with https://"),
      })
      .parse(fd(f));
    await updateWebsiteInfo(getDb(), me.id, d);
    revalidatePath("/");
    revalidatePath("/admin/website");
    return "Website details saved";
  });
}

export async function updateFacilitiesAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    await setFacilities(getDb(), me.id, f.getAll("on").map(String)); // only the ticked ones are sent
    revalidatePath("/");
    revalidatePath("/admin/website");
    return "Facilities saved";
  });
}

export async function addSitePhotoAction(f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const file = fileOf(f, "file");
    if (!file) throw new AppError("Choose a photo first", "file");
    const d = z.object({ caption: S.text(120) }).parse(fd(f));
    await addSitePhoto(getDb(), me.id, await validateFile(file, "photo", "file"), d.caption);
    revalidatePath("/");
    revalidatePath("/admin/website");
    return "Photo added to your website";
  });
}

export async function deleteSitePhotoAction(id: string) {
  return run(async () => {
    const me = await requireAdmin();
    await deleteSitePhoto(getDb(), me.id, S.id.parse(id));
    revalidatePath("/");
    revalidatePath("/admin/website");
    return "Photo removed";
  });
}

/** "Collect all dues since check-in": one entry, settled oldest-first across every month up to the last due date. */
export async function collectDuesAction(tenantId: string, f: FormData) {
  return run(async () => {
    const me = await requireAdmin();
    const d = z
      .object({ purpose: z.enum(["rent", "expense"]).default("rent"), amount: z.string().optional().transform((v, ctx) => { if (!v?.trim()) return null; try { return S.money.parse(v); } catch { ctx.addIssue({ code: "custom", message: "Enter a valid amount, like 1500 or 1500.50" }); return z.NEVER; } }), paidOn: S.date, method: z.enum(["cash", "upi", "bank_transfer", "other"]), reference: S.optText(100), note: S.optText(200) })
      .parse(fd(f));
    const r = await collectDues(getDb(), me.id, { tenantId: S.id.parse(tenantId), purpose: d.purpose, amountPaise: d.amount, paidOn: d.paidOn, method: d.method, reference: d.reference, note: d.note });
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return `Collected ${formatINR(r.collected)} across ${r.payments.length} month${r.payments.length > 1 ? "s" : ""}${r.remaining > 0 ? ` · ${formatINR(r.remaining)} still due` : " · all clear"}`;
  });
}
