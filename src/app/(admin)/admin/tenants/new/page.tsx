import { ActionForm } from "@/components/action-form";
import { TenantFields } from "@/components/tenant-fields";
import { Card, PageHeader } from "@/components/ui";
import { addTenantAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { todayISO } from "@/lib/dates";
import { getSettings } from "@/services/billing";
import { activeTenantCount, listRoomsWithBeds } from "@/services/tenants";
import { MAX_ACTIVE_TENANTS } from "@/lib/features";
import { BackLink } from "@/components/back-link";

export const metadata = { title: "Add tenant" };

export default async function NewTenant({ searchParams }: { searchParams: Promise<{ bed?: string }> }) {
  const preferredBed = (await searchParams).bed ?? "";
  const db = getDb();
  const [rooms, settings, active] = await Promise.all([listRoomsWithBeds(db), getSettings(db), activeTenantCount(db)]);
  if (active >= MAX_ACTIVE_TENANTS) {
    return (
      <>
        <BackLink href="/admin/tenants" label="Tenants" />
        <PageHeader title="Add tenant" />
        <Card className="max-w-xl p-5 text-sm"><p className="font-semibold">The PG is full</p><p className="mt-1 text-muted">There are already {active} active tenants (the limit is {MAX_ACTIVE_TENANTS}), so no new tenant can be added. Vacate a tenant first, then come back.</p></Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Add tenant" description="Creates a login for the tenant. Share the temporary password privately." />
      <Card className="max-w-3xl p-5">
        <ActionForm action={addTenantAction} submit="Add tenant" redirectTo="/admin/tenants" reset={false}>
          <TenantFields rooms={rooms} defaultBedId={preferredBed} defaultRentPaise={settings.defaultRentPaise} t={{ joiningDate: todayISO() }} />
        </ActionForm>
      </Card>
    </>
  );
}
