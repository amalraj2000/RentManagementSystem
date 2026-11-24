import Link from "next/link";
import { eq, desc, asc, isNull, and, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { bedAssignments, beds, rooms, tenantDocuments, tenantProfiles, users } from "@/db/schema";
import { Avatar } from "@/components/avatar";
import { ShareLoginButton } from "@/components/share-login-button";
import { ImpersonateButton } from "@/components/impersonate-button";
import { ConfirmButton } from "@/components/action-form";
import { Badge, buttonClass, EditLink, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { offsetFor, PAGE_SIZE, pageParam } from "@/lib/page";
import { deleteTenantAction, revertVacateAction } from "@/actions/admin";
import { AddTenantButton } from "@/components/add-tenant-button";
import { activeTenantCount } from "@/services/tenants";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export const metadata = { title: "Tenants" };

export default async function Tenants({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageParam((await searchParams).page);
  const rows = await getDb()
    .select({
      id: tenantProfiles.id, name: users.name, phone: tenantProfiles.phone, status: tenantProfiles.status,
      photoId: tenantDocuments.id, rent: tenantProfiles.monthlyRentPaise, joined: tenantProfiles.joiningDate, left: tenantProfiles.moveOutDate, room: rooms.name, bed: beds.bedNumber,
    })
    .from(tenantProfiles)
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .leftJoin(bedAssignments, and(eq(bedAssignments.tenantId, tenantProfiles.id), isNull(bedAssignments.endDate)))
    .leftJoin(beds, eq(beds.id, bedAssignments.bedId))
    .leftJoin(rooms, eq(rooms.id, beds.roomId))
    .leftJoin(tenantDocuments, and(eq(tenantDocuments.tenantId, tenantProfiles.id), eq(tenantDocuments.kind, "photo")))
    .orderBy(asc(tenantProfiles.status), desc(tenantProfiles.createdAt))
    .limit(PAGE_SIZE)
    .offset(offsetFor(page));
  const active = await activeTenantCount(getDb());
  const [{ total }] = await getDb().select({ total: sql<number>`count(*)` }).from(tenantProfiles);
  return (
    <>
      <PageHeader title="Tenants" actions={<AddTenantButton active={active} />} />
      {rows.length === 0 ? <Empty>No tenants yet. Add your first resident.</Empty> : (
        <Table>
          <thead><tr><Th>Name</Th><Th>Bed</Th><Th>Mobile number</Th><Th>Rent</Th><Th>Joined / Vacated</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td><Link className="flex items-center gap-2.5 font-medium hover:underline" href={`/admin/tenants/${r.id}`}><Avatar photoId={r.photoId} name={r.name} className="size-8 text-xs" />{r.name}</Link></Td>
                <Td>{r.room ? `${r.room} · Bed ${r.bed}` : <span className="text-muted">—</span>}</Td>
                <Td>{r.phone}</Td>
                <Td className="tabular-nums">{formatINR(r.rent)}</Td>
                <Td>{formatDate(r.joined)}{r.status === "moved_out" && r.left ? <> / {formatDate(r.left)}</> : null}</Td>
                <Td><Badge kind={r.status} /></Td>
                <Td>
                  <RowActions>
                    <ImpersonateButton tenantId={r.id} name={r.name} />
                    {r.status !== "moved_out" && <ShareLoginButton tenantId={r.id} name={r.name} />}
                    {r.status === "moved_out" && <ConfirmButton label="Undo vacate" variant="secondary" title={`Undo vacate for ${r.name}?`} body="They become an active tenant again and billing resumes. Their old bed is given back if it is still free." action={revertVacateAction.bind(null, r.id)} confirmLabel="Undo vacate" />}
                    <EditLink href={`/admin/tenants/${r.id}`} />
                    <ConfirmButton label="Delete" title={`Delete ${r.name}?`} body="Only possible if they have no invoices or payments. Otherwise use Vacate on their page — history is preserved." action={deleteTenantAction.bind(null, r.id)} confirmLabel="Delete" />
                  </RowActions>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={Number(total)} basePath="/admin/tenants" />
    </>
  );
}
