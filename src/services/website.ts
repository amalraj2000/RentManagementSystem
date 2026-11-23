import { asc, desc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { rentSettings, sitePhotos } from "@/db/schema";
import { AppError, audit } from "./common";
import type { ValidFile } from "./documents";

export const MAX_SITE_PHOTOS = 12;

export type WebsiteInfo = { pgName: string; tagline: string; about: string; address: string; contactPhone: string; whatsapp: string; contactEmail: string; mapsLink: string };

export const DEFAULT_WEBSITE: WebsiteInfo = { pgName: "Our PG", tagline: "", about: "", address: "", contactPhone: "", whatsapp: "", contactEmail: "", mapsLink: "" };

export async function getWebsiteInfo(db: DB): Promise<WebsiteInfo> {
  const [s] = await db
    .select({ pgName: rentSettings.pgName, tagline: rentSettings.tagline, about: rentSettings.about, address: rentSettings.address, contactPhone: rentSettings.contactPhone, whatsapp: rentSettings.whatsapp, contactEmail: rentSettings.contactEmail, mapsLink: rentSettings.mapsLink })
    .from(rentSettings)
    .where(eq(rentSettings.id, 1));
  return s ?? DEFAULT_WEBSITE;
}

export async function updateWebsiteInfo(db: DB, actorId: string, w: WebsiteInfo) {
  await db.update(rentSettings).set(w).where(eq(rentSettings.id, 1));
  await audit(db, actorId, "website.update", "settings", "1");
}

/** Metadata only — never the image bytes. */
export const listSitePhotos = (db: DB) =>
  db.select({ id: sitePhotos.id, caption: sitePhotos.caption, sizeBytes: sitePhotos.sizeBytes }).from(sitePhotos).orderBy(asc(sitePhotos.sortOrder), desc(sitePhotos.createdAt));

export async function addSitePhoto(db: DB, actorId: string, f: ValidFile, caption: string) {
  if (f.mimeType === "application/pdf") throw new AppError("Photos must be JPG, PNG or WebP images", "file");
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)` }).from(sitePhotos);
    if (Number(n) >= MAX_SITE_PHOTOS) throw new AppError(`You can show up to ${MAX_SITE_PHOTOS} photos. Delete one first.`, "file");
    const [row] = await tx
      .insert(sitePhotos)
      .values({ caption: caption.trim().slice(0, 120), mimeType: f.mimeType, sizeBytes: f.data.length, data: f.data, sortOrder: Number(n) })
      .returning({ id: sitePhotos.id });
    await audit(tx, actorId, "website.photo_add", "site_photo", row.id, { bytes: f.data.length });
    return row.id;
  });
}

export async function deleteSitePhoto(db: DB, actorId: string, id: string) {
  const [p] = await db.select({ id: sitePhotos.id }).from(sitePhotos).where(eq(sitePhotos.id, id));
  if (!p) throw new AppError("Photo not found");
  await db.delete(sitePhotos).where(eq(sitePhotos.id, id));
  await audit(db, actorId, "website.photo_delete", "site_photo", id);
}

/** Public read (no login): used by the landing page image route. */
export async function getSitePhoto(db: DB, id: string) {
  const [p] = await db.select({ mimeType: sitePhotos.mimeType, data: sitePhotos.data }).from(sitePhotos).where(eq(sitePhotos.id, id));
  if (!p) return null;
  return { mimeType: p.mimeType, data: Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data as unknown as ArrayBuffer) };
}
