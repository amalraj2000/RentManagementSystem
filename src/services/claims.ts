import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { invoices, paymentClaims, tenantProfiles, users } from "@/db/schema";
import { balanceOf } from "@/lib/billing";
import { monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { AppError, audit, type Q } from "./common";
import type { ValidFile } from "./documents";
import { notifyAdmins, notifyTenant, tenantName } from "./notifications";
import { recordPaymentTx } from "./billing";
import { tenantForUser } from "./portal";

export const MAX_PENDING_CLAIMS = 5;
type Method = "cash" | "upi" | "bank_transfer" | "other";

const pendingFor = async (q: Q, invoiceId: string) => {
  const [r] = await q
    .select({ n: sql<number>`coalesce(sum(${paymentClaims.amountPaise}), 0)`, c: sql<number>`count(*)` })
    .from(paymentClaims)
    .where(and(eq(paymentClaims.invoiceId, invoiceId), eq(paymentClaims.status, "pending")));
  return { amount: Number(r.n), count: Number(r.c) };
};

/**
 * A tenant reports a payment they made. Tenant is derived from the SESSION user, never from input.
 * It does NOT change any balance — the owner must confirm it first.
 */
export async function createClaim(
  db: DB,
  userId: string,
  c: { invoiceId: string; amountPaise: number; paidOn: string; method: Method; reference?: string | null; note?: string | null; screenshot?: ValidFile | null },
  today = todayISO(),
) {
  const me = await tenantForUser(db, userId);
  if (!me) throw new AppError("Tenant profile not found");
  if (!Number.isInteger(c.amountPaise) || c.amountPaise <= 0) throw new AppError("Enter an amount greater than zero", "amount");
  if (c.paidOn > today) throw new AppError("The payment date can't be in the future", "paidOn");
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, c.invoiceId), eq(invoices.tenantId, me.id))); // someone else's invoice == not found
    if (!inv || inv.cancelledAt) throw new AppError("Bill not found");
    const balance = balanceOf(inv);
    if (balance <= 0) throw new AppError("This bill is already fully paid");
    const pending = await pendingFor(tx, inv.id);
    if (pending.count >= MAX_PENDING_CLAIMS) throw new AppError("You already have several payment reports waiting for the owner to confirm.");
    const claimable = balance - pending.amount;
    if (claimable <= 0) throw new AppError("Your earlier payment report already covers the full balance and is waiting to be confirmed.", "amount");
    if (c.amountPaise > claimable) throw new AppError(`You can report at most ${formatINR(claimable)} for this bill${pending.amount ? " (other reports are waiting for confirmation)" : ""}.`, "amount");
    const [row] = await tx
      .insert(paymentClaims)
      .values({
        invoiceId: inv.id,
        tenantId: me.id,
        amountPaise: c.amountPaise,
        paidOn: c.paidOn,
        method: c.method,
        reference: c.reference || null,
        note: c.note || null,
        screenshot: c.screenshot?.data ?? null,
        screenshotMime: c.screenshot?.mimeType ?? null,
        screenshotName: c.screenshot?.fileName ?? null,
      })
      .returning({ id: paymentClaims.id });
    await audit(tx, userId, "claim.create", "payment_claim", row.id, { invoiceId: inv.id, amount: c.amountPaise, method: c.method, screenshot: !!c.screenshot });
    await notifyAdmins(tx, { type: "claim_submitted", title: `${me.name} reported a payment`, body: `${formatINR(c.amountPaise)} via ${c.method.replace("_", " ")} for ${monthLabel(inv.periodMonth)}${c.screenshot ? " · screenshot attached" : ""}. Please verify.`, href: "/admin/payments/claims", dedupeKey: `claim:${row.id}` });
    return row.id;
  });
}

const claimCols = {
  id: paymentClaims.id,
  invoiceId: paymentClaims.invoiceId,
  amountPaise: paymentClaims.amountPaise,
  paidOn: paymentClaims.paidOn,
  method: paymentClaims.method,
  reference: paymentClaims.reference,
  note: paymentClaims.note,
  hasShot: sql<number>`${paymentClaims.screenshot} is not null`,
  status: paymentClaims.status,
  rejectReason: paymentClaims.rejectReason,
  createdAt: paymentClaims.createdAt,
  month: invoices.periodMonth,
};

/** Metadata only (never the image bytes). Scoped to the logged-in tenant. */
export async function myClaims(db: DB, userId: string, limit = 30) {
  const me = await tenantForUser(db, userId);
  if (!me) return [];
  return db.select(claimCols).from(paymentClaims).innerJoin(invoices, eq(invoices.id, paymentClaims.invoiceId)).where(eq(paymentClaims.tenantId, me.id)).orderBy(desc(paymentClaims.createdAt)).limit(limit);
}

export async function claimsForInvoice(db: DB, tenantId: string, invoiceId: string) {
  return db.select(claimCols).from(paymentClaims).innerJoin(invoices, eq(invoices.id, paymentClaims.invoiceId)).where(and(eq(paymentClaims.tenantId, tenantId), eq(paymentClaims.invoiceId, invoiceId))).orderBy(desc(paymentClaims.createdAt));
}

export async function adminClaims(db: DB, status: "pending" | "approved" | "rejected" | "all", limit: number, offset: number) {
  const q = db
    .select({ ...claimCols, tenantName: users.name, tenantId: tenantProfiles.id, balance: sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}` })
    .from(paymentClaims)
    .innerJoin(invoices, eq(invoices.id, paymentClaims.invoiceId))
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, paymentClaims.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId));
  return (status === "all" ? q : q.where(eq(paymentClaims.status, status))).orderBy(desc(paymentClaims.createdAt)).limit(limit).offset(offset);
}

export async function countClaims(db: DB, status: "pending" | "approved" | "rejected" | "all") {
  const q = db.select({ n: sql<number>`count(*)` }).from(paymentClaims);
  const [r] = await (status === "all" ? q : q.where(eq(paymentClaims.status, status)));
  return Number(r.n);
}

export async function pendingClaimCount(db: DB) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(paymentClaims).where(eq(paymentClaims.status, "pending"));
  return Number(r.n);
}

/** Turns a claim into a REAL payment (receipt, balances, reports) in one transaction. */
export async function approveClaim(db: DB, adminId: string, claimId: string, amountPaise?: number) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(paymentClaims).where(eq(paymentClaims.id, claimId));
    if (!c) throw new AppError("Payment report not found");
    if (c.status !== "pending") throw new AppError("This report was already reviewed");
    const amount = amountPaise ?? c.amountPaise;
    const pay = await recordPaymentTx(tx, adminId, {
      invoiceId: c.invoiceId,
      amountPaise: amount,
      paidOn: c.paidOn,
      method: c.method,
      reference: c.reference,
      note: `Reported by tenant${c.note ? `: ${c.note}` : ""}`,
    });
    await tx.update(paymentClaims).set({ status: "approved", reviewedBy: adminId, reviewedAt: new Date(), paymentId: pay.id }).where(eq(paymentClaims.id, claimId));
    await audit(tx, adminId, "claim.approve", "payment_claim", claimId, { paymentId: pay.id, amount, claimed: c.amountPaise });
    return pay;
  });
}

export async function rejectClaim(db: DB, adminId: string, claimId: string, reason: string) {
  if (!reason.trim()) throw new AppError("Give a reason so the tenant knows why", "reason");
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(paymentClaims).where(eq(paymentClaims.id, claimId));
    if (!c) throw new AppError("Payment report not found");
    if (c.status !== "pending") throw new AppError("This report was already reviewed");
    await tx.update(paymentClaims).set({ status: "rejected", rejectReason: reason.trim(), reviewedBy: adminId, reviewedAt: new Date() }).where(eq(paymentClaims.id, claimId));
    await audit(tx, adminId, "claim.reject", "payment_claim", claimId, { reason });
    await notifyTenant(tx, c.tenantId, { type: "claim_rejected", title: "Payment report not accepted", body: `Your report of ${formatINR(c.amountPaise)} could not be confirmed. Reason: ${reason.trim()}`, href: "/portal/payments", dedupeKey: `claimrej:${claimId}` });
    const who = await tenantName(tx, c.tenantId);
    await notifyAdmins(tx, { type: "claim_rejected", title: `Report rejected: ${who}`, body: `${formatINR(c.amountPaise)} · ${reason.trim()}`, href: "/admin/payments/claims", dedupeKey: `claimrej:${claimId}` }, adminId);
  });
}

/** Authorisation for the screenshot: admins any; a tenant only their own claim. */
export async function getClaimScreenshot(db: DB, claimId: string, user: { id: string; role: "admin" | "tenant" }) {
  const [r] = await db
    .select({ data: paymentClaims.screenshot, mime: paymentClaims.screenshotMime, name: paymentClaims.screenshotName, ownerUserId: tenantProfiles.userId })
    .from(paymentClaims)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, paymentClaims.tenantId))
    .where(eq(paymentClaims.id, claimId));
  if (!r?.data || !r.mime) return null;
  if (user.role !== "admin" && r.ownerUserId !== user.id) return null;
  return { mimeType: r.mime, fileName: r.name ?? "screenshot", data: Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data as unknown as ArrayBuffer) };
}
