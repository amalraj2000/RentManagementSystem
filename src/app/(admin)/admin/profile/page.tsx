import { ActionForm, ConfirmButton } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { FileInput } from "@/components/file-input";
import { removeMyPhotoAdminAction, updateMyPhotoAdminAction } from "@/actions/auth";
import { userPhotoVersion } from "@/services/avatars";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { changePassword, logoutOtherDevices, updateProfile } from "@/actions/auth";
import { getDb } from "@/db/client";
import { eq, desc, sql } from "drizzle-orm";
import { auditLogs, sessions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "My profile" };

export default async function AdminProfile() {
  const me = await requireAdmin();
  const db = getDb();
  const [[u], [{ n }], recent] = await Promise.all([
    db.select({ lastLoginAt: users.lastLoginAt, createdAt: users.createdAt, phone: users.phone }).from(users).where(eq(users.id, me.id)),
    db.select({ n: sql<number>`count(*)` }).from(sessions).where(eq(sessions.userId, me.id)),
    db.select({ action: auditLogs.action, at: auditLogs.createdAt }).from(auditLogs).where(eq(auditLogs.actorId, me.id)).orderBy(desc(auditLogs.createdAt)).limit(8),
  ]);
  const photoVersion = await userPhotoVersion(db, me.id);
  const fmt = (d: Date | null) => d?.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) ?? "—";
  return (
    <>
      <PageHeader title="My profile" description={`Administrator · account created ${fmt(u.createdAt)}`} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Profile photo</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar src={photoVersion ? `/api/avatars/${me.id}?v=${photoVersion}` : null} name={me.name} className="size-20 text-2xl" />
            <div className="min-w-0 flex-1 basis-64">
              <ActionForm action={updateMyPhotoAdminAction} submit={photoVersion ? "Change photo" : "Upload photo"} className="space-y-1">
                <FileInput name="file" accept="image/jpeg,image/png,image/webp" required label="Profile photo" />
                <p className="text-xs text-muted">JPG, PNG or WebP up to 1.5 MB. Large photos are shrunk automatically.</p>
              </ActionForm>
            </div>
            {photoVersion && <ConfirmButton variant="secondary" label="Remove photo" title="Remove your profile photo?" action={removeMyPhotoAdminAction} confirmLabel="Remove" />}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Account details</h2>
          <ActionForm action={updateProfile} submit="Save changes" reset={false} className="space-y-3">
            <Field label="Name"><Input name="name" required maxLength={100} defaultValue={me.name} /></Field>
            <Field label="Email (used to log in)"><Input name="email" type="email" required defaultValue={me.email} autoComplete="username" /></Field>
            <Field label="Mobile number (optional)"><Input name="phone" type="tel" maxLength={20} defaultValue={u.phone ?? ""} /></Field>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Change password</h2>
          <ActionForm action={changePassword} submit="Update password" className="space-y-3">
            <Field label="Current password"><Input name="current" type="password" autoComplete="current-password" required /></Field>
            <Field label="New password" hint="At least 10 characters."><Input name="next" type="password" autoComplete="new-password" minLength={10} required /></Field>
            <Field label="Confirm new password"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Sessions</h2>
          <p className="mb-3 text-sm text-muted">Last login {fmt(u.lastLoginAt)} · {Number(n)} active session(s).</p>
          <ConfirmButton variant="secondary" label="Logout other devices" title="Logout from all other devices?" body="This device stays logged in." action={logoutOtherDevices} confirmLabel="Logout others" />
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold">My recent activity</h2>
          <ul className="space-y-1 text-sm">
            {recent.length === 0 && <li className="text-muted">Nothing yet</li>}
            {recent.map((r, i) => <li key={i} className="flex justify-between gap-3"><span>{r.action}</span><span className="text-muted">{fmt(r.at)}</span></li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
