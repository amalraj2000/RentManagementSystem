import Link from "next/link";
import { Armchair, Bath, Pencil, Sofa, Utensils } from "lucide-react";
import { Bed } from "@/components/bed";
import { Card, Empty, iconButtonClass, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { listRoomsWithBeds } from "@/services/tenants";

export const metadata = { title: "Rooms & beds" };

export default async function RoomsPage() {
  const rooms = await listRoomsWithBeds(getDb());
  const beds = rooms.flatMap((r) => r.beds);
  const used = beds.filter((b) => b.tenantId).length;
  return (
    <>
      <PageHeader
        title="Rooms & beds"
        description={`${rooms.length} bedroom${rooms.length === 1 ? "" : "s"} · ${used} of ${beds.length} beds occupied`}
        // DISABLED — adding rooms is switched off (rooms are fixed). To bring it back, set ROOM_ADD_DELETE_ENABLED in src/lib/features.ts
        // and restore this button:
        //   actions={<Link href="/admin/rooms/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Add room</Link>}
      />

      {rooms.length === 0 ? <Empty>No rooms found.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rooms.map((r) => {
            const free = r.beds.filter((b) => !b.tenantId).length;
            return (
              <section key={r.id} aria-labelledby={`room-${r.id}`}>
                {/* the room: a box with a thick "wall", like a floor plan */}
                <Card className="rounded-2xl border-2 border-slate-300 p-4 sm:p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 id={`room-${r.id}`} className="truncate text-lg font-semibold">{r.name}</h2>
                      <p className="mt-0.5 text-xs text-muted">{r.beds.length - free} of {r.beds.length} beds occupied{free ? ` · ${free} vacant` : " · full"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.bathroom && <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-slate-50 px-2 py-1 text-xs text-slate-600"><Bath className="size-3.5" aria-hidden /> Attached bathroom</span>}
                      <Link href={`/admin/rooms/${r.id}/edit`} title="Edit room" aria-label={`Edit ${r.name}`} className={iconButtonClass()}><Pencil className="size-4" aria-hidden /></Link>
                      {/* DISABLED — deleting rooms is switched off. To bring it back, set ROOM_ADD_DELETE_ENABLED in src/lib/features.ts and restore:
                          <ConfirmButton label="Delete" title={`Delete ${r.name}?`} body="Nobody must be living in it…" action={deleteRoomAction.bind(null, r.id)} confirmLabel="Delete" /> */}
                    </div>
                  </div>
                  <ul className="grid grid-cols-2 gap-3 sm:gap-4">
                    {r.beds.map((b) => (
                      <li key={b.id}>
                        <Bed number={b.number} tenantId={b.tenantId} tenantName={b.tenantName} photoId={b.photoId} assignHref={`/admin/tenants/new?bed=${b.id}`} />
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-sm text-slate-600">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted">Shared</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 ring-1 ring-line"><Utensils className="size-4 text-accent" aria-hidden /> Kitchen</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 ring-1 ring-line"><Sofa className="size-4 text-accent" aria-hidden /> Hall</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 ring-1 ring-line"><Armchair className="size-4 text-accent" aria-hidden /> Sit-out</span>
      </div>
    </>
  );
}
