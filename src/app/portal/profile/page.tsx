import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Badge } from "@/components/ui";
import { changePassword } from "@/actions/auth";
import { getDb } from "@/db/client";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { getSettings } from "@/services/billing";
import { tenantForUser } from "@/services/portal";

export const metadata = { title: "Profile" };

export default async function Profile() {
  const user = await requireTenant();
  const db = getDb();
  const [me, settings] = await Promise.all([tenantForUser(db, user.id), getSettings(db)]);
  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">My details</h2>
          {me && (
            <dl className="space-y-2 text-sm">
              {([
                ["Name", me.name], ["Email", me.email], ["Phone", me.phone],
                ["Room", me.roomName ? `${me.roomName} · Bed ${me.bedNumber}` : "Not assigned"],
                ["Joined", formatDate(me.joiningDate)], ["Monthly rent", formatINR(me.monthlyRentPaise)], ["Security deposit", formatINR(me.securityDepositPaise)],
                ["Emergency contact", me.emergencyContactName ? `${me.emergencyContactName} (${me.emergencyContactPhone ?? "—"})` : "—"],
              ] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
              <div className="flex justify-between"><dt className="text-muted">Status</dt><dd><Badge kind={me.status} /></dd></div>
            </dl>
          )}
          <p className="mt-3 text-xs text-muted">To change these details, ask the PG owner.</p>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Change password</h2>
          <ActionForm action={changePassword} submit="Update password" className="space-y-3">
            <Field label="Current password"><Input name="current" type="password" autoComplete="current-password" required /></Field>
            <Field label="New password" hint="At least 10 characters with letters and numbers."><Input name="next" type="password" autoComplete="new-password" minLength={10} required /></Field>
            <Field label="Confirm new password"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold">House rules</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">{settings.houseRules || "No rules posted yet."}</p>
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold">Important contacts</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">{settings.contactInfo || "No contacts posted yet."}</p>
        </Card>
      </div>
    </>
  );
}
