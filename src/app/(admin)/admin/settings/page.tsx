import { ActionForm } from "@/components/action-form";
import { SettingsTabs } from "@/components/settings-tabs";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { updateSettingsAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { paiseToInput } from "@/lib/money";
import { getSettings } from "@/services/billing";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await getSettings(getDb());
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs current="general" />
      <Card className="max-w-2xl p-5">
        <ActionForm action={updateSettingsAction} reset={false} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Default monthly rent (₹)" hint="Pre-filled for new tenants. Each tenant has their own rent."><Input name="defaultRent" inputMode="decimal" required defaultValue={paiseToInput(s.defaultRentPaise)} /></Field>
            <Field label="Rent due day of month" hint="1–28. Applies to newly generated invoices."><Input name="dueDay" type="number" min={1} max={28} required defaultValue={s.dueDayOfMonth} /></Field>
            <Field label="Default electricity split">
              <Select name="electricityMethod" defaultValue={s.electricityMethod}>
                <option value="equal_residents">Equal – eligible residents</option><option value="equal_beds">Equal – occupied beds</option><option value="custom">Custom per tenant</option>
              </Select>
            </Field>
            <Field label="Default water split">
              <Select name="waterMethod" defaultValue={s.waterMethod}><option value="equal_residents">Equal – eligible residents</option><option value="custom">Custom per tenant</option></Select>
            </Field>
          </div>
          <Field label="House rules (shown to tenants)"><Textarea name="houseRules" rows={6} maxLength={4000} defaultValue={s.houseRules} /></Field>
          <Field label="Important contacts (shown to tenants)"><Textarea name="contactInfo" rows={4} maxLength={2000} defaultValue={s.contactInfo} /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
