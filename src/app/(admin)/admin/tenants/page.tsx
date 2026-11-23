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
import { MarkPaidButton } from "@/components/mark-paid-button";
import { paymentsByTenant, unpaidItemsByTenant } from "@/services/reports";
import { PopupButton } from "@/components/paid-list-button";
import { ReceiptText } from "lucide-react";
import { methodLabel } from "@/lib/payment-methods";
import { monthLabel } from "@/lib/dates";
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
      photoId: tenantDocuments.id, rent: tenantProfiles.monthlyRentPaise, joined: tenantProfiles.joiningDate, room: rooms.name, bed: beds.bedNumber,
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
  const [unpaid, active, paid] = await Promise.all([unpaidItemsByTenant(getDb(), rows.map((r) => r.id)), activeTenantCount(getDb()), paymentsByTenant(getDb(), rows.map((r) => r.id))]);
  const [{ total }] = await getDb().select({ total: sql<number>`count(*)` }).from(tenantProfiles);
  return (
    <>
      <PageHeader title="Tenants" actions={<AddTenantButton active={active} />} />
      {rows.length === 0 ? <Empty>No tenants yet. Add your first resident.</Empty> : (
        <Table>
          <thead><tr><Th>Name</Th><Th>Bed</Th><Th>Mobile number</Th><Th>Rent</Th><Th>Joined</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td><Link className="flex items-center gap-2.5 font-medium hover:underline" href={`/admin/tenants/${r.id}`}><Avatar photoId={r.photoId} name={r.name} className="size-8 text-xs" />{r.name}</Link></Td>
                <Td>{r.room ? `${r.room} · Bed ${r.bed}` : <span className="text-muted">—</span>}</Td>
                <Td>{r.phone}</Td>
                <Td className="tabular-nums">{formatINR(r.rent)}</Td>
                <Td>{formatDate(r.joined)}</Td>
                <Td><Badge kind={r.status} /></Td>
                <Td>
                  <RowActions>
                    {(() => {
                      const list = paid.get(r.id) ?? [];
                      // rent and expenses are added up separately — never together
                      const rentTotal = list.filter((p) => p.purpose === "rent").reduce((a, p) => a + p.amount, 0);
                      const expTotal = list.filter((p) => p.purpose === "expense").reduce((a, p) => a + p.amount, 0);
                      return (
                        <PopupButton icon={<ReceiptText className="size-4" aria-hidden />} label="Paid list" title={`${r.name} · payments`}>
                          {list.length === 0 ? <p className="px-5 py-8 text-center text-muted">No payments yet.</p> : (
                            <>
                              <div className="grid grid-cols-2 gap-3 border-b border-line px-5 py-3">
                                <div><p className="text-xs text-muted">Rent paid</p><p className="font-semibold tabular-nums">{formatINR(rentTotal)}</p></div>
                                <div><p className="text-xs text-muted">Expenses paid</p><p className="font-semibold tabular-nums">{formatINR(expTotal)}</p></div>
                              </div>
                              <ul className="divide-y divide-line">
                                {list.map((p) => (
                                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                                    <div className="min-w-0">
                                      <p className="font-medium">{p.what} <span className="font-normal text-muted">· {monthLabel(p.month)}</span></p>
                                      <p className="text-xs text-muted">{formatDate(p.paidOn)} · {methodLabel(p.method)} · <a href={`/receipt/${p.id}`} target="_blank" rel="noopener" className="text-accent hover:underline">Receipt</a></p>
                                    </div>
                                    <span className="shrink-0 font-medium tabular-nums">{formatINR(p.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </PopupButton>
                      );
                    })()}
                    <MarkPaidButton iconOnly name={r.name} items={unpaid.get(r.id) ?? []} />
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
