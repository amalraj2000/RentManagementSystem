import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { tenantDocuments, tenantProfiles } from "@/db/schema";
import { AppError, audit, type Q } from "./common";

export const MAX_FILE_BYTES = 1.5 * 1024 * 1024; // app limit; the DB CHECK allows up to 2 MB
export const MAX_ID_PROOFS = 4;
export const ID_TYPES = { aadhaar: "Aadhaar", pan: "PAN", voter: "Voter ID", driving_licence: "Driving licence", passport: "Passport", college_id: "College / office ID", other: "Other" } as const;
export type IdType = keyof typeof ID_TYPES;

export type ValidFile = { fileName: string; mimeType: string; data: Buffer };

/** Detects the real type from file signature — the browser-supplied type/extension is never trusted. */
export function sniffMime(b: Uint8Array): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 11 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (b.length > 4 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

export async function validateFile(file: File, kind: "photo" | "id_proof", field = "file"): Promise<ValidFile> {
  if (file.size === 0) throw new AppError("The selected file is empty", field);
  if (file.size > MAX_FILE_BYTES) throw new AppError(`"${file.name}" is too large. Maximum size is 1.5 MB.`, field);
  const data = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffMime(data);
  if (!mimeType) throw new AppError("Unsupported file. Use a JPG, PNG, WebP or PDF.", field);
  if (kind === "photo" && mimeType === "application/pdf") throw new AppError("A profile photo must be an image (JPG, PNG or WebP)", field);
  const fileName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "file";
  return { fileName, mimeType, data };
}

export async function saveDocumentTx(q: Q, actorId: string, tenantId: string, kind: "photo" | "id_proof", f: ValidFile, idType?: string | null) {
  if (kind === "id_proof") {
    const existing = await q.select({ id: tenantDocuments.id }).from(tenantDocuments).where(and(eq(tenantDocuments.tenantId, tenantId), eq(tenantDocuments.kind, "id_proof")));
    if (existing.length >= MAX_ID_PROOFS) throw new AppError(`You can attach up to ${MAX_ID_PROOFS} ID documents. Delete one first.`, "file");
  } else {
    await q.delete(tenantDocuments).where(and(eq(tenantDocuments.tenantId, tenantId), eq(tenantDocuments.kind, "photo")));
  }
  const [row] = await q
    .insert(tenantDocuments)
    .values({ tenantId, kind, idType: kind === "id_proof" ? (idType && idType in ID_TYPES ? idType : "other") : null, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.data.length, data: f.data, uploadedBy: actorId })
    .returning({ id: tenantDocuments.id });
  await audit(q, actorId, `document.${kind === "photo" ? "photo_set" : "id_add"}`, "tenant", tenantId, { documentId: row.id, mime: f.mimeType, bytes: f.data.length });
  return row.id;
}

export async function uploadDocument(db: DB, actorId: string, tenantId: string, kind: "photo" | "id_proof", file: File, idType?: string | null) {
  const f = await validateFile(file, kind, "file");
  return db.transaction(async (tx) => {
    const [t] = await tx.select({ id: tenantProfiles.id }).from(tenantProfiles).where(eq(tenantProfiles.id, tenantId));
    if (!t) throw new AppError("Tenant not found");
    return saveDocumentTx(tx, actorId, tenantId, kind, f, idType);
  });
}

/** Metadata only — never selects the file bytes, so lists stay fast. */
export const listDocuments = (q: Q, tenantId: string) =>
  q
    .select({ id: tenantDocuments.id, kind: tenantDocuments.kind, idType: tenantDocuments.idType, fileName: tenantDocuments.fileName, mimeType: tenantDocuments.mimeType, sizeBytes: tenantDocuments.sizeBytes, createdAt: tenantDocuments.createdAt })
    .from(tenantDocuments)
    .where(eq(tenantDocuments.tenantId, tenantId))
    .orderBy(asc(tenantDocuments.kind), asc(tenantDocuments.createdAt));

export async function deleteDocument(db: DB, actorId: string, id: string) {
  const [d] = await db.select({ id: tenantDocuments.id, tenantId: tenantDocuments.tenantId, kind: tenantDocuments.kind }).from(tenantDocuments).where(eq(tenantDocuments.id, id));
  if (!d) throw new AppError("File not found");
  await db.delete(tenantDocuments).where(eq(tenantDocuments.id, id));
  await audit(db, actorId, "document.delete", "tenant", d.tenantId, { documentId: id, kind: d.kind });
}

/**
 * Authorisation lives here, not in the route: admins can read any file; a tenant can only read files
 * attached to the profile that belongs to their own session user.
 */
export async function getDocumentForUser(db: DB, id: string, user: { id: string; role: "admin" | "tenant" }) {
  const [d] = await db
    .select({ mimeType: tenantDocuments.mimeType, fileName: tenantDocuments.fileName, data: tenantDocuments.data, ownerUserId: tenantProfiles.userId })
    .from(tenantDocuments)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, tenantDocuments.tenantId))
    .where(eq(tenantDocuments.id, id));
  if (!d) return null;
  if (user.role !== "admin" && d.ownerUserId !== user.id) return null;
  return { mimeType: d.mimeType, fileName: d.fileName, data: Buffer.isBuffer(d.data) ? d.data : Buffer.from(d.data as unknown as ArrayBuffer) };
}

export async function photoIdFor(q: Q, tenantId: string) {
  const [p] = await q.select({ id: tenantDocuments.id }).from(tenantDocuments).where(and(eq(tenantDocuments.tenantId, tenantId), eq(tenantDocuments.kind, "photo")));
  return p?.id ?? null;
}

/** A tenant changing THEIR OWN profile photo. The tenant is derived from the session user; only the photo kind is allowed. */
export async function setOwnPhoto(db: DB, userId: string, file: File) {
  const [t] = await db.select({ id: tenantProfiles.id }).from(tenantProfiles).where(eq(tenantProfiles.userId, userId));
  if (!t) throw new AppError("Tenant profile not found");
  const f = await validateFile(file, "photo", "file");
  await db.transaction(async (tx) => {
    await saveDocumentTx(tx, userId, t.id, "photo", f);
  });
}

export async function removeOwnPhoto(db: DB, userId: string) {
  const [t] = await db.select({ id: tenantProfiles.id }).from(tenantProfiles).where(eq(tenantProfiles.userId, userId));
  if (!t) throw new AppError("Tenant profile not found");
  await db.delete(tenantDocuments).where(and(eq(tenantDocuments.tenantId, t.id), eq(tenantDocuments.kind, "photo")));
  await audit(db, userId, "document.photo_removed", "tenant", t.id);
}
