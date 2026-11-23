import Link from "next/link";
import { Bath, Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { buttonClass, EditLink, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { pageParam, slicePage } from "@/lib/page";
import { deleteRoomAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { roomSummaries } from "@/services/rooms";
import { listRoomsWithBeds } from "@/services/tenants";

export const metadata = { title: "Rooms & beds" };

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageParam((await searchParams).page);
  const db = getDb();
  const [summary, detail] = await Promise.all([roomSummaries(db), listRoomsWithBeds(db)]);
  const occupants = new Map(detail.map((r) => [r.id, r.beds.filter((b) => b.tenantName).map((b) => `${b.tenantName} (Bed ${b.number})`)]));
  const { items: pageRows, total: roomCount } = slicePage(summary, page);
  const total = summary.reduce((a, r) => ({ beds: a.beds + r.beds, occ: a.occ + r.occupied }), { beds: 0, occ: 0 });
  return (
    <>
      <PageHeader
        title="Rooms & beds"
        description={`${summary.length} room${summary.length === 1 ? "" : "s"} · ${total.occ} of ${total.beds} beds occupied · kitchen, hall and sit-out are shared.`}
        actions={<Link href="/admin/rooms/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Add room</Link>}
      />
      {summary.length === 0 ? <Empty>No rooms yet. Add your first room.</Empty> : (
        <Table>
          <thead><tr><Th>Room</Th><Th>Beds</Th><Th>Occupied</Th><Th>Bathroom</Th><Th>Residents</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.name}</Td>
                <Td>{r.beds}</Td>
                <Td><span className={r.occupied >= r.beds && r.beds > 0 ? "font-medium text-amber-700" : ""}>{r.occupied} / {r.beds}</span></Td>
                <Td className="text-muted">{r.bathroom ? <span className="inline-flex items-center gap-1"><Bath className="size-3.5" aria-hidden /> Attached</span> : "Shared"}</Td>
                <Td className="max-w-xs !whitespace-normal text-muted">{occupants.get(r.id)?.join(", ") || "—"}</Td>
                <Td>
                  <RowActions>
                    <EditLink href={`/admin/rooms/${r.id}/edit`} />
                    <ConfirmButton label="Delete" title={`Delete ${r.name}?`} body="Nobody must be living in it. If tenants stayed here before, the room is hidden but their bed history is kept." action={deleteRoomAction.bind(null, r.id)} confirmLabel="Delete" />
                  </RowActions>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={roomCount} basePath="/admin/rooms" />
    </>
  );
}
