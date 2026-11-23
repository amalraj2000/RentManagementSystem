import { Field, Input, Select, Textarea } from "@/components/ui";
import { paiseToInput } from "@/lib/money";

type T = { name?: string; email?: string; phone?: string; joiningDate?: string; monthlyRentPaise?: number; securityDepositPaise?: number; emergencyContactName?: string | null; emergencyContactPhone?: string | null; notes?: string | null; status?: string };

export function TenantFields({ t, defaultRentPaise }: { t?: T; defaultRentPaise?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Full name"><Input name="name" required minLength={2} maxLength={100} defaultValue={t?.name} /></Field>
      <Field label="Email (login)"><Input name="email" type="email" required defaultValue={t?.email} autoComplete="off" /></Field>
      <Field label="Mobile number"><Input name="phone" type="tel" required defaultValue={t?.phone} /></Field>
      <Field label="Joining date"><Input name="joiningDate" type="date" required defaultValue={t?.joiningDate} /></Field>
      <Field label="Monthly rent (₹)"><Input name="monthlyRent" inputMode="decimal" required defaultValue={paiseToInput(t?.monthlyRentPaise ?? defaultRentPaise ?? 0)} /></Field>
      <Field label="Security deposit (₹)"><Input name="deposit" inputMode="decimal" required defaultValue={paiseToInput(t?.securityDepositPaise ?? 0)} /></Field>
      <Field label="Emergency contact name"><Input name="emergencyContactName" maxLength={100} defaultValue={t?.emergencyContactName ?? ""} /></Field>
      <Field label="Emergency contact number"><Input name="emergencyContactPhone" type="tel" defaultValue={t?.emergencyContactPhone ?? ""} /></Field>
      {t?.status && (
        <Field label="Status">
          <Select name="status" defaultValue={t.status}>
            <option value="active">Active</option>
            <option value="notice">Notice period</option>
          </Select>
        </Field>
      )}
      <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" maxLength={500} defaultValue={t?.notes ?? ""} /></Field>
    </div>
  );
}
