import Link from "next/link";
import { eq, desc, asc, isNull, and } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { bedAssignments, beds, rooms, tenantProfiles, users } from "@/db/schema";
import { Badge, buttonClass, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export const metadata = { title: "Tenants" };

export default async function Tenants() {
  const rows = await getDb()
    .select({
      id: tenantProfiles.id, name: users.name, phone: tenantProfiles.phone, status: tenantProfiles.status,
      rent: tenantProfiles.monthlyRentPaise, joined: tenantProfiles.joiningDate, room: rooms.name, bed: beds.bedNumber,
    })
    .from(tenantProfiles)
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .leftJoin(bedAssignments, and(eq(bedAssignments.tenantId, tenantProfiles.id), isNull(bedAssignments.endDate)))
    .leftJoin(beds, eq(beds.id, bedAssignments.bedId))
    .leftJoin(rooms, eq(rooms.id, beds.roomId))
    .orderBy(asc(tenantProfiles.status), desc(tenantProfiles.createdAt))
    .limit(100);
  return (
    <>
      <PageHeader title="Tenants" actions={<Link href="/admin/tenants/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Add tenant</Link>} />
      {rows.length === 0 ? <Empty>No tenants yet. Add your first resident.</Empty> : (
        <Table>
          <thead><tr><Th>Name</Th><Th>Bed</Th><Th>Phone</Th><Th>Rent</Th><Th>Joined</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td><Link className="font-medium hover:underline" href={`/admin/tenants/${r.id}`}>{r.name}</Link></Td>
                <Td>{r.room ? `${r.room} · Bed ${r.bed}` : <span className="text-muted">—</span>}</Td>
                <Td>{r.phone}</Td>
                <Td className="tabular-nums">{formatINR(r.rent)}</Td>
                <Td>{formatDate(r.joined)}</Td>
                <Td><Badge kind={r.status} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
