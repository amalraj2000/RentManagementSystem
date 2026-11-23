import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { userPhotos } from "@/db/schema";
import { AppError, audit } from "./common";
import { validateFile } from "./documents";

/** Sets or replaces a user's own profile photo (images only, 1.5 MB max, type checked from the file's bytes). */
export async function setUserPhoto(db: DB, userId: string, file: File) {
  const f = await validateFile(file, "photo", "file");
  await db.transaction(async (tx) => {
    await tx.delete(userPhotos).where(eq(userPhotos.userId, userId));
    await tx.insert(userPhotos).values({ userId, mimeType: f.mimeType, sizeBytes: f.data.length, data: f.data });
    await audit(tx, userId, "auth.photo_set", "user", userId, { bytes: f.data.length });
  });
}

export async function removeUserPhoto(db: DB, userId: string) {
  const [p] = await db.select({ userId: userPhotos.userId }).from(userPhotos).where(eq(userPhotos.userId, userId));
  if (!p) throw new AppError("You don't have a profile photo to remove");
  await db.delete(userPhotos).where(eq(userPhotos.userId, userId));
  await audit(db, userId, "auth.photo_removed", "user", userId);
}

/** A tiny version stamp so the browser reloads the picture right after it changes (null = no photo). */
export async function userPhotoVersion(db: DB, userId: string) {
  const [p] = await db.select({ at: userPhotos.updatedAt }).from(userPhotos).where(eq(userPhotos.userId, userId));
  return p ? p.at.getTime() : null;
}

export async function userIdsWithPhotos(db: DB) {
  return new Set((await db.select({ id: userPhotos.userId }).from(userPhotos)).map((r) => r.id));
}

/** Admins can see any user's photo; everyone else only their own. */
export async function getUserPhoto(db: DB, targetUserId: string, viewer: { id: string; role: "admin" | "tenant" }) {
  if (viewer.role !== "admin" && viewer.id !== targetUserId) return null;
  const [p] = await db.select({ mimeType: userPhotos.mimeType, data: userPhotos.data }).from(userPhotos).where(eq(userPhotos.userId, targetUserId));
  if (!p) return null;
  return { mimeType: p.mimeType, data: Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data as unknown as ArrayBuffer) };
}
