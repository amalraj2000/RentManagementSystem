import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { RoomFields } from "@/components/room-fields";
import { Badge, Card, EditLink, PageHeader, RowActions, Table, Td, Th } from "@/components/ui";
import { updateRoomAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { rooms } from "@/db/schema";
import { listRoomsWithBeds } from "@/services/tenants";

export const metadata = { title: "Edit room" };

export default async function EditRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
  if (!room || room.archivedAt) notFound();
  const detail = (await listRoomsWithBeds(db)).find((r) => r.id === id);
  return (
    <>
      <BackLink href="/admin/rooms" label="Rooms & beds" />
      <PageHeader title={`Edit ${room.name}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Room details</h2>
          <ActionForm action={updateRoomAction.bind(null, id)} redirectTo="/admin/rooms" reset={false}><RoomFields r={room} /></ActionForm>
        </Card>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Beds in this room</h2>
          <Table>
            <thead><tr><Th>Bed</Th><Th>Occupant</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
            <tbody>
              {(detail?.beds ?? []).map((b) => (
                <tr key={b.id}>
                  <Td className="font-medium">Bed {b.number}</Td>
                  <Td>{b.tenantName ?? <span className="text-muted">—</span>}</Td>
                  <Td>{b.tenantId ? <Badge kind="active" /> : <span className="text-xs text-muted">Vacant</span>}</Td>
                  <Td><RowActions>{b.tenantId ? <EditLink href={`/admin/tenants/${b.tenantId}`} label="Edit / move" /> : <EditLink href="/admin/tenants/new" label="Assign tenant" />}</RowActions></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted">Change the number of beds on the left. Reducing it only removes vacant beds that never had a tenant.</p>
        </div>
      </div>
    </>
  );
}
