"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { run, fd } from "@/lib/action";
import { requireTenantWrite } from "@/lib/session";
import * as S from "@/lib/schemas";
import { createClaim } from "@/services/claims";
import { removeOwnPhoto, setOwnPhoto, validateFile } from "@/services/documents";
import { AppError } from "@/services/common";

const fileOf = (f: FormData, name: string) => {
  const v = f.get(name);
  return v instanceof File && v.size > 0 ? v : null;
};

/** Tenant reports a payment (pending until the owner confirms). Tenant id comes from the session, never the form. */
export async function reportPaymentAction(invoiceId: string, f: FormData) {
  return run(async () => {
    const me = await requireTenantWrite();
    const d = z
      .object({ amount: S.positiveMoney, paidOn: S.date, method: z.enum(["cash", "upi", "bank_transfer", "other"]), reference: S.optText(100), note: S.optText(200) })
      .parse(fd(f));
    const shot = fileOf(f, "screenshot");
    const screenshot = shot ? await validateFile(shot, "photo", "screenshot") : null; // images only
    await createClaim(getDb(), me.id, { invoiceId: S.id.parse(invoiceId), amountPaise: d.amount, paidOn: d.paidOn, method: d.method, reference: d.reference, note: d.note, screenshot });
    revalidatePath("/portal", "layout");
    revalidatePath("/admin", "layout");
    return "Sent! The owner will confirm your payment soon.";
  });
}

export async function updateMyPhotoAction(f: FormData) {
  return run(async () => {
    const me = await requireTenantWrite();
    const file = fileOf(f, "file");
    if (!file) throw new AppError("Choose a photo first", "file");
    await setOwnPhoto(getDb(), me.id, file);
    revalidatePath("/", "layout");
    return "Profile photo updated";
  });
}

export async function removeMyPhotoAction() {
  return run(async () => {
    const me = await requireTenantWrite();
    await removeOwnPhoto(getDb(), me.id);
    revalidatePath("/", "layout");
    return "Profile photo removed";
  });
}
