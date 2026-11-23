import Link from "next/link";
import { Bath, Utensils } from "lucide-react";
import { getDb } from "@/db/client";
import { Card, PageHeader } from "@/components/ui";
import { listRoomsWithBeds } from "@/services/tenants";

export const metadata = { title: "Rooms & beds" };

export default async function RoomsPage() {
  const rooms = await listRoomsWithBeds(getDb());
  return (
    <>
      <PageHeader title="Rooms & beds" description="Shared: kitchen, hall and sit-out." />
      <div className="grid gap-4 md:grid-cols-2">
        {rooms.map((r) => {
          const used = r.beds.filter((b) => b.tenantId).length;
          return (
            <Card key={r.id} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{r.name}</h2>
                  <p className="flex items-center gap-1 text-xs text-muted"><Bath className="size-3.5" aria-hidden /> Attached bathroom</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${used >= r.maxOccupancy ? "bg-slate-100 text-slate-700 ring-slate-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>{used >= r.maxOccupancy ? "Full" : `${r.maxOccupancy - used} vacant`}</span>
              </div>
              <p className="mb-3 text-sm text-muted">{used} of {r.maxOccupancy} beds occupied</p>
              <ul className="grid grid-cols-2 gap-2">
                {r.beds.map((b) => (
                  <li key={b.id} className={`rounded-lg border p-3 text-sm ${b.tenantId ? "border-accent/30 bg-accent-soft/40" : "border-dashed border-line"}`}>
                    <p className="text-xs text-muted">Bed {b.number}</p>
                    {b.tenantId ? <Link className="font-medium hover:underline" href={`/admin/tenants/${b.tenantId}`}>{b.tenantName}</Link> : <span className="text-muted">Vacant</span>}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Utensils className="size-3.5" aria-hidden /> Assign or move residents from their tenant page.</p>
    </>
  );
}
