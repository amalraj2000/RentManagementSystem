"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { run } from "@/lib/action";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/schemas";
import { markAllRead, markRead } from "@/services/notifications";
import { AppError } from "@/services/common";
import { and, eq } from "drizzle-orm";
import { notifications } from "@/db/schema";

async function peekHref(userId: string, id: string) {
  const [n] = await getDb().select({ href: notifications.href }).from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  return n?.href ?? null;
}

const safe = (href: string | null, fallback: string) => (href && href.startsWith("/") && !href.startsWith("//") ? href : fallback);

/** Marks one of MY notifications read, then goes to where it points. */
export async function openNotification(id: string) {
  const me = await requireUser();
  const href = me.impersonatedBy ? await peekHref(me.id, S.id.parse(id)) : await markRead(getDb(), me.id, S.id.parse(id));
  revalidatePath("/", "layout");
  redirect(safe(href, me.role === "admin" ? "/admin/notifications" : "/portal/notifications"));
}

export async function markAllReadAction() {
  return run(async () => {
    const me = await requireUser();
    if (me.impersonatedBy) throw new AppError("Read status is not changed while viewing as a tenant.");
    await markAllRead(getDb(), me.id);
    revalidatePath("/", "layout");
    return "All notifications marked as read";
  });
}
