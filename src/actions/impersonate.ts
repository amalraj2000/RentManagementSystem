"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { tenantProfiles, users } from "@/db/schema";
import { run } from "@/lib/action";
import { dropCurrentSession, getCurrentUser, requireAdmin, startSession } from "@/lib/session";
import * as S from "@/lib/schemas";
import { AppError, audit } from "@/services/common";

/**
 * Admin → "login as tenant" without their password. Safe by design:
 *  - only a real admin session can start it (an impersonation session is a tenant session, so it can't nest);
 *  - the new session is tied to the admin, expires in 1 hour, and is READ-ONLY (changes are blocked server-side);
 *  - start and stop are written to the audit log.
 */
export async function impersonateTenantAction(tenantId: string) {
  return run(async () => {
    const admin = await requireAdmin();
    const db = getDb();
    const [t] = await db
      .select({ userId: users.id, active: users.isActive, tenantId: tenantProfiles.id })
      .from(tenantProfiles)
      .innerJoin(users, eq(users.id, tenantProfiles.userId))
      .where(and(eq(tenantProfiles.id, S.id.parse(tenantId)), eq(users.role, "tenant")));
    if (!t) throw new AppError("Tenant not found");
    if (!t.active) throw new AppError("This tenant's login is disabled. Enable it first.");
    await audit(db, admin.id, "impersonate.start", "tenant", t.tenantId);
    await dropCurrentSession(); // the admin session ends here; "Back to admin" creates a fresh one
    await startSession(t.userId, { impersonatedBy: admin.id });
    redirect("/portal");
  });
}

/** Leaves "viewing as tenant" and returns to the admin dashboard. */
export async function stopImpersonationAction() {
  const me = await getCurrentUser();
  if (!me?.impersonatedBy) redirect("/?login=1");
  const db = getDb();
  const [admin] = await db.select().from(users).where(and(eq(users.id, me.impersonatedBy), eq(users.role, "admin"), eq(users.isActive, true)));
  await dropCurrentSession();
  if (!admin) redirect("/?login=1");
  await audit(db, admin.id, "impersonate.stop", "user", me.id);
  await startSession(admin.id);
  redirect("/admin/tenants");
}
