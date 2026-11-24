import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ImageIcon } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/action-form";
import { ChoiceChips, METHOD_CHOICES } from "@/components/choice-chips";
import { Badge, Card, Empty, Field, Input, PageHeader } from "@/components/ui";
import { approveClaimAction, markPaidAction, rejectClaimAction, revertPaymentsAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { tenantProfiles, users } from "@/db/schema";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR, paiseToInput } from "@/lib/money";
import { methodLabel } from "@/lib/payment-methods";
import { requireAdmin } from "@/lib/session";
import { paymentActivity } from "@/services/payment-activity";
import { paymentsByTenant, unpaidItemsByTenant } from "@/services/reports";

export const metadata = { title: "Tenant payments" };

/**
 * One tenant's payments in one place:
 *  - payments they REPORTED, waiting for you to approve or reject
 *  - what is still unpaid (one line per month) — mark any of it as paid
 *  - what has been paid — revert one if it was a mistake
 */
export default async function TenantPayments({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const db = getDb();
  const [t] = await db.select({ id: tenantProfiles.id, name: users.name, status: tenantProfiles.status }).from(tenantProfiles).innerJoin(users, eq(users.id, tenantProfiles.userId)).where(eq(tenantProfiles.id, id));
  if (!t) notFound();
  const [unpaid, paid, activity] = await Promise.all([unpaidItemsByTenant(db, [id]), paymentsByTenant(db, [id], 100), paymentActivity(db)]);
  const waiting = activity.filter((r) => r.tenantId === id && r.status === "waiting");
  const owed = unpaid.get(id) ?? [];
  const done = paid.get(id) ?? [];
  const methodField = <div className="mt-3"><span className="mb-1.5 block text-sm font-medium">How was it paid?</span><ChoiceChips name="method" label="How was it paid" options={METHOD_CHOICES} defaultValue="upi" /></div>;
  return (
    <>
      <BackLink href="/admin/payments" label="Rent" />
      <PageHeader title={t.name} description="Payments, one by one" actions={<Link href={`/admin/tenants/${id}`} className="text-sm font-medium text-accent hover:underline">Tenant details</Link>} />

      {waiting.length > 0 && (
        <section className="mb-6" aria-labelledby="w-h">
          <h2 id="w-h" className="mb-2 text-sm font-semibold">Waiting for you to confirm</h2>
          <Card>
            <ul className="divide-y divide-line">
              {waiting.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{monthLabel(r.month)} <span className="tabular-nums">· {formatINR(r.amountPaise)}</span></p>
                    <p className="text-xs text-muted">Reported {formatDate(r.date)} · {methodLabel(r.method)}{r.reference ? ` · ${r.reference}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {r.hasProof && <a href={`/api/claims/${r.id}`} target="_blank" rel="noopener" title="View screenshot" aria-label="View screenshot" className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-white text-accent hover:bg-slate-50"><ImageIcon className="size-4" aria-hidden /></a>}
                    <ConfirmButton
                      label="Approve"
                      variant="primary"
                      title={`Confirm ${formatINR(r.amountPaise)} from ${r.tenantName}?`}
                      body="This records a real payment and issues a receipt. Only confirm once you've seen the money arrive."
                      confirmLabel="Confirm payment"
                      extra={<div className="mt-3"><Field label="Amount received (₹)" hint={`Still due on this bill: ${formatINR(Math.max(r.balance, 0))}`}><Input name="amount" inputMode="decimal" required defaultValue={paiseToInput(Math.min(r.amountPaise, Math.max(r.balance, 0)))} /></Field></div>}
                      action={approveClaimAction.bind(null, r.id)}
                    />
                    <ConfirmButton label="Reject" title="Reject this report?" body="The tenant is told why." withReason confirmLabel="Reject" action={rejectClaimAction.bind(null, r.id)} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="mb-6" aria-labelledby="u-h">
        <h2 id="u-h" className="mb-2 text-sm font-semibold">Not paid yet</h2>
        <Card>
          {owed.length === 0 ? <Empty>Nothing unpaid. All paid up.</Empty> : (
            <ul className="divide-y divide-line">
              {owed.map((i) => (
                <li key={i.invoiceId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Rent <span className="font-normal text-muted">· {monthLabel(i.month)}</span></p>
                    <p className="text-sm tabular-nums">{formatINR(i.amount)}</p>
                  </div>
                  <ConfirmButton
                    label="Mark paid"
                    variant="primary"
                    title={`Mark rent (${monthLabel(i.month)}) as paid?`}
                    body={`${t.name} · ${formatINR(i.amount)}. This records the full amount as received today.`}
                    confirmLabel="Mark paid"
                    action={markPaidAction.bind(null, i.invoiceId)}
                    extra={methodField}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section aria-labelledby="p-h">
        <h2 id="p-h" className="mb-2 text-sm font-semibold">Paid</h2>
        <Card>
          {done.length === 0 ? <Empty>No payments yet.</Empty> : (
            <ul className="divide-y divide-line">
              {done.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Rent <span className="font-normal text-muted">· {monthLabel(p.month)}</span> <Badge kind="paid" /></p>
                    <p className="text-xs text-muted"><span className="tabular-nums">{formatINR(p.amount)}</span> · {formatDate(p.paidOn)} · {methodLabel(p.method)} · <a href={`/receipt/${p.id}`} target="_blank" rel="noopener" className="text-accent hover:underline">Receipt</a></p>
                  </div>
                  <ConfirmButton
                    label="Revert"
                    variant="secondary"
                    title="Revert this payment?"
                    body={`Rent ${formatINR(p.amount)} stops counting as paid but stays in the records.`}
                    confirmLabel="Revert"
                    action={revertPaymentsAction}
                    extra={<div className="mt-3"><input type="hidden" name="pay" value={p.id} /><input name="reason" maxLength={200} placeholder="Reason (optional)" aria-label="Reason" className="w-full rounded-lg border border-line px-3 py-2 text-sm" /></div>}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
