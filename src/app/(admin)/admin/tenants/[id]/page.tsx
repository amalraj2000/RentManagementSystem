import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { TenantFields } from "@/components/tenant-fields";
import { Badge, Card, PageHeader } from "@/components/ui";
import { updateTenantAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { bedAssignments, beds, rooms, tenantProfiles, users } from "@/db/schema";
import { unpaidItemsByTenant } from "@/services/reports";
import { MarkPaidButton } from "@/components/mark-paid-button";
import { formatDate } from "@/lib/dates";
import { listRoomsWithBeds } from "@/services/tenants";
import { listDocuments } from "@/services/documents";

export const metadata = { title: "Tenant" };

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db
    .select({ p: tenantProfiles, name: users.name, email: users.email })
    .from(tenantProfiles)
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(eq(tenantProfiles.id, id));
  if (!row) notFound();
  const { p } = row;
  const [current, rooms_, docs, unpaid] = await Promise.all([
    db
      .select({ room: rooms.name, bed: beds.bedNumber, bedId: beds.id })
      .from(bedAssignments)
      .innerJoin(beds, eq(beds.id, bedAssignments.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(and(eq(bedAssignments.tenantId, id), isNull(bedAssignments.endDate)))
      .then((r) => r[0]),
    listRoomsWithBeds(db),
    listDocuments(db, id),
    unpaidItemsByTenant(db, [id]),
  ]);
  const movedOut = p.status === "moved_out";
  const photo = docs.find((d) => d.kind === "photo");
  const update = updateTenantAction.bind(null, id);
  return (
    <>
      <PageHeader
        title={row.name}
        description={current ? `${current.room} · Bed ${current.bed}` : movedOut ? `Vacated ${formatDate(p.moveOutDate)}` : "No bed assigned"}
        actions={<><MarkPaidButton name={row.name} items={unpaid.get(id) ?? []} /><Badge kind={p.status} /></>}
      />
      <Card className="max-w-3xl p-5">
        <ActionForm action={update} submit="Save changes" reset={false}>
          <TenantFields
            t={{ ...p, name: row.name, email: row.email }}
            rooms={rooms_}
            tenantId={id}
            currentBedId={current?.bedId ?? null}
            existingPhoto={photo?.fileName ?? null}
            existingIdCount={docs.filter((d) => d.kind === "id_proof").length}
          />
        </ActionForm>
      </Card>
    </>
  );
}
