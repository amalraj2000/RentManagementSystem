import { ActionForm } from "@/components/action-form";
import { TenantFields } from "@/components/tenant-fields";
import { FileInput } from "@/components/file-input";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { ID_TYPES } from "@/services/documents";
import { addTenantAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { todayISO } from "@/lib/dates";
import { getSettings } from "@/services/billing";
import { listRoomsWithBeds } from "@/services/tenants";

export const metadata = { title: "Add tenant" };

export default async function NewTenant({ searchParams }: { searchParams: Promise<{ bed?: string }> }) {
  const preferredBed = (await searchParams).bed ?? "";
  const db = getDb();
  const [rooms, settings] = await Promise.all([listRoomsWithBeds(db), getSettings(db)]);
  return (
    <>
      <PageHeader title="Add tenant" description="Creates a login for the tenant. Share the temporary password privately." />
      <Card className="max-w-3xl p-5">
        <ActionForm action={addTenantAction} submit="Add tenant" redirectTo="/admin/tenants" reset={false}>
          <TenantFields defaultRentPaise={settings.defaultRentPaise} t={{ joiningDate: todayISO() }} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Assign bed" hint="Only vacant beds are selectable">
              <Select name="bedId" defaultValue={rooms.some((r) => r.beds.some((b) => b.id === preferredBed && !b.tenantId)) ? preferredBed : ""}>
                <option value="">Assign later</option>
                {rooms.map((r) => (
                  <optgroup key={r.id} label={r.name}>
                    {r.beds.map((b) => <option key={b.id} value={b.id} disabled={!!b.tenantId}>Bed {b.number}{b.tenantId ? ` — ${b.tenantName}` : ""}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="Temporary password" hint="At least 10 characters. Tenant must change it on first login.">
              <Input name="password" type="text" required minLength={10} autoComplete="off" />
            </Field>
          </div>
          <div className="mt-3 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <Field label="Profile photo (optional)"><FileInput name="photo" accept="image/jpeg,image/png,image/webp" label="Profile photo" /></Field>
            <div className="space-y-2">
              <Field label="ID proof type (optional)">
                <Select name="idType" defaultValue="aadhaar">{Object.entries(ID_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              </Field>
              <FileInput name="idProof" accept="image/jpeg,image/png,image/webp,application/pdf" label="ID proof file" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">JPG, PNG, WebP or PDF up to 1.5 MB each. You can add more ID documents later from the tenant&apos;s page.</p>
        </ActionForm>
      </Card>
    </>
  );
}
