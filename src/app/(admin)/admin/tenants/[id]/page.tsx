import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { TenantFields } from "@/components/tenant-fields";
import { Badge, Card, Empty, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { deleteTenantAction, moveBedAction, revertVacateAction, vacateAction, resetPasswordAction, toggleLoginAction, updateTenantAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { bedAssignments, beds, invoices, rooms, tenantProfiles, users } from "@/db/schema";
import { invoiceSplits, unpaidItemsByTenant } from "@/services/reports";
import { MarkPaidButton } from "@/components/mark-paid-button";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { listRoomsWithBeds } from "@/services/tenants";
import { listDocuments } from "@/services/documents";
import { DocumentsCard } from "@/components/documents-card";

export const metadata = { title: "Tenant" };

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db
    .select({ p: tenantProfiles, name: users.name, email: users.email, active: users.isActive })
    .from(tenantProfiles)
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(eq(tenantProfiles.id, id));
  if (!row) notFound();
  const { p } = row;
  const [invs, history, rooms_, docs] = await Promise.all([
    invoiceSplits(db, eq(invoices.tenantId, id)).then((all) => all.sort((a, b) => b.periodMonth.localeCompare(a.periodMonth)).slice(0, 12)),
    db
      .select({ room: rooms.name, bed: beds.bedNumber, start: bedAssignments.startDate, end: bedAssignments.endDate })
      .from(bedAssignments)
      .innerJoin(beds, eq(beds.id, bedAssignments.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(eq(bedAssignments.tenantId, id))
      .orderBy(desc(bedAssignments.startDate)),
    listRoomsWithBeds(db),
    listDocuments(db, id),
  ]);
  const today = todayISO();
  const current = history.find((h) => !h.end);
  const movedOut = p.status === "moved_out";
  const update = updateTenantAction.bind(null, id);
  const moveBed = moveBedAction.bind(null, id);
  const vacate = vacateAction.bind(null, id);
  const reset = resetPasswordAction.bind(null, id);
  async function del() {
    "use server";
    const r = await deleteTenantAction(id);
    if (r.ok) redirect("/admin/tenants");
    return r;
  }
  return (
    <>
      <PageHeader
        title={row.name}
        description={current ? `${current.room} · Bed ${current.bed}` : movedOut ? `Vacated ${formatDate(p.moveOutDate)}` : "No bed assigned"}
        actions={<><MarkPaidButton name={row.name} items={(await unpaidItemsByTenant(db, [id])).get(id) ?? []} /><Badge kind={p.status} /></>}
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            {movedOut && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                <span>Vacated {formatDate(p.moveOutDate)}. You can still correct their details.</span>
                <ConfirmButton label="Undo vacate" variant="secondary" title="Undo vacate?" body="They become an active tenant again and billing resumes. Their old bed is given back if it is still free." action={revertVacateAction.bind(null, id)} confirmLabel="Undo vacate" />
              </div>
            )}
              <ActionForm action={update} reset={false}>
                <TenantFields t={{ ...p, name: row.name, email: row.email }} />
              </ActionForm>
          </Card>
          <DocumentsCard tenantId={id} name={row.name} docs={docs} />
          <div>
            <h2 className="mb-2 text-sm font-semibold">Recent invoices</h2>
            {invs.length === 0 ? <Card><Empty>No invoices yet.</Empty></Card> : (
              <Table>
                <thead><tr><Th>Month</Th><Th>Rent</Th><Th>Expenses</Th></tr></thead>
                <tbody>
                  {invs.map((i) => (
                    <tr key={i.id}>
                      <Td><Link className="font-medium hover:underline" href={`/admin/invoices/${i.id}`}>{monthLabel(i.periodMonth)}</Link></Td>
                      <Td className="tabular-nums">{formatINR(i.split.rentPayable)}<span className={`block text-xs ${i.split.rentBalance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{i.split.rentBalance > 0 ? `${formatINR(i.split.rentBalance)} due` : "paid"}</span></Td>
                      <Td className="tabular-nums">{i.split.expensePayable > 0 ? <>{formatINR(i.split.expensePayable)}<span className={`block text-xs ${i.split.expenseBalance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{i.split.expenseBalance > 0 ? `${formatINR(i.split.expenseBalance)} due` : "paid"}</span></> : <span className="text-muted">—</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </div>
        <div className="space-y-4">
          {!movedOut && (
            <>
              <Card className="p-5">
                <h2 className="mb-3 text-sm font-semibold">Bed assignment</h2>
                <ActionForm action={moveBed} submit="Update bed" reset={false}>
                  <div className="space-y-3">
                    <Field label="Bed">
                      <Select name="bedId" defaultValue="">
                        <option value="">No bed</option>
                        {rooms_.map((r) => (
                          <optgroup key={r.id} label={r.name}>
                            {r.beds.map((b) => <option key={b.id} value={b.id} disabled={!!b.tenantId && b.tenantId !== id}>Bed {b.number}{b.tenantId && b.tenantId !== id ? ` — ${b.tenantName}` : ""}</option>)}
                          </optgroup>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Effective from"><Input name="date" type="date" required defaultValue={today} /></Field>
                  </div>
                </ActionForm>
              </Card>
              <Card className="p-5">
                <h2 className="mb-3 text-sm font-semibold">Access</h2>
                <ActionForm action={reset} submit="Reset password" reset>
                  <Field label="New temporary password"><Input name="password" required minLength={10} autoComplete="off" /></Field>
                </ActionForm>
                <div className="mt-3">
                  <ConfirmButton variant="secondary" label={row.active ? "Disable login" : "Enable login"} title={row.active ? "Disable this tenant's login?" : "Enable login?"} action={toggleLoginAction.bind(null, id, !row.active)} confirmLabel="Confirm" />
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="mb-1 text-sm font-semibold">Vacate</h2>
                <p className="mb-3 text-xs text-muted">Frees the bed. Invoices, payments and any unpaid balance are kept.</p>
                <ActionForm action={vacate} submit="Vacate" variant="danger" reset={false}>
                  <Field label="Vacate date"><Input name="date" type="date" required defaultValue={today} /></Field>
                </ActionForm>
              </Card>
            </>
          )}
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold">Bed history</h2>
            <ul className="space-y-1 text-sm">
              {history.length === 0 && <li className="text-muted">None</li>}
              {history.map((h, i) => <li key={i}>{h.room} · Bed {h.bed} <span className="text-muted">({formatDate(h.start)} → {h.end ? formatDate(h.end) : "now"})</span></li>)}
            </ul>
          </Card>
          {invs.length === 0 && (
            <Card className="p-5">
              <h2 className="mb-1 text-sm font-semibold">Delete record</h2>
              <p className="mb-3 text-xs text-muted">Only possible because this tenant has no invoices or payments.</p>
              <ConfirmButton label="Delete tenant" title="Delete this tenant permanently?" body="This removes the tenant and their login. This cannot be undone." action={del} confirmLabel="Delete" />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
