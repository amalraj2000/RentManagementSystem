import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { RoomFields } from "@/components/room-fields";
import { Card, Field, PageHeader, Select } from "@/components/ui";
import { arrangeBedsAction, updateRoomAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { rooms } from "@/db/schema";
import { listActiveTenantsWithBed, listRoomsWithBeds } from "@/services/tenants";

export const metadata = { title: "Edit room" };

export default async function EditRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
  if (!room || room.archivedAt) notFound();
  const [all, people] = await Promise.all([listRoomsWithBeds(db), listActiveTenantsWithBed(db)]);
  const detail = all.find((r) => r.id === id);
  return (
    <>
      <BackLink href="/admin/rooms" label="Rooms & beds" />
      <PageHeader title={`Edit ${room.name}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Room details</h2>
          <ActionForm action={updateRoomAction.bind(null, id)} redirectTo="/admin/rooms" reset={false}><RoomFields r={room} /></ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Who sleeps where</h2>
          <p className="mb-3 text-xs text-muted">Choose a tenant for each bed. To swap two tenants, pick each one in the other&apos;s bed. Someone from another room is moved here. Leave a bed empty to free it.</p>
          <ActionForm action={arrangeBedsAction.bind(null, id)} submit="Save beds" reset={false}>
            <ul className="space-y-3">
              {(detail?.beds ?? []).map((b) => (
                <li key={b.id}>
                  <Field label={`Bed ${b.number}`}>
                    <Select name={`bed_${b.id}`} defaultValue={b.tenantId ?? ""}>
                      <option value="">— Empty —</option>
                      {people.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}{t.room && t.room !== room.name ? ` (now in ${t.room} · Bed ${t.bed})` : !t.room ? " (no bed yet)" : ""}</option>
                      ))}
                    </Select>
                  </Field>
                </li>
              ))}
            </ul>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
