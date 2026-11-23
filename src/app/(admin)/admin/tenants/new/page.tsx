import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { TenantFields } from "@/components/tenant-fields";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { addTenantAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { todayISO } from "@/lib/dates";
import { getSettings } from "@/services/billing";
import { listRoomsWithBeds } from "@/services/tenants";

export const metadata = { title: "Add tenant" };

async function add(f: FormData) {
  "use server";
  const r = await addTenantAction(f);
  if (r.ok) redirect("/admin/tenants");
  return r;
}

export default async function NewTenant() {
  const db = getDb();
  const [rooms, settings] = await Promise.all([listRoomsWithBeds(db), getSettings(db)]);
  return (
    <>
      <PageHeader title="Add tenant" description="Creates a login for the tenant. Share the temporary password privately." />
      <Card className="max-w-3xl p-5">
        <ActionForm action={add} submit="Add tenant" reset={false}>
          <TenantFields defaultRentPaise={settings.defaultRentPaise} t={{ joiningDate: todayISO() }} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Assign bed" hint="Only vacant beds are selectable">
              <Select name="bedId" defaultValue="">
                <option value="">Assign later</option>
                {rooms.map((r) => (
                  <optgroup key={r.id} label={r.name}>
                    {r.beds.map((b) => <option key={b.id} value={b.id} disabled={!!b.tenantId}>Bed {b.number}{b.tenantId ? ` — ${b.tenantName}` : ""}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="Temporary password" hint="Min 10 characters, letters and numbers. Tenant must change it on first sign-in.">
              <Input name="password" type="text" required minLength={10} autoComplete="off" />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
