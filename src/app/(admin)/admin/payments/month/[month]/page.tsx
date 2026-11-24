import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { MarkPaidButton } from "@/components/mark-paid-button";
import { RevertPaidButton } from "@/components/revert-paid-button";
import { Badge, Empty, Field, Input, PageHeader, RowActions, Table, Td, Th, iconButtonClass } from "@/components/ui";
import { approveClaimAction, rejectClaimAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { MONTH_RE, monthLabel, todayISO } from "@/lib/dates";
import { formatINR, paiseToInput } from "@/lib/money";
import { requireAdmin } from "@/lib/session";
import { paymentActivity } from "@/services/payment-activity";
import { paymentBoard, paymentsByTenant, unpaidItemsByTenant } from "@/services/reports";

export const metadata = { title: "Payments" };

/** One month: every active tenant, whether they have paid, and the actions to mark paid / take back / approve a reported payment. */
export default async function PaymentsMonth({ params }: { params: Promise<{ month: string }> }) {
  await requireAdmin();
  const { month } = await params;
  if (!MONTH_RE.test(month)) notFound();
  const db = getDb();
  const tenants = await paymentBoard(db, month, todayISO());
  const ids = tenants.map((t) => t.tenantId);
  const [all, unpaid, paid] = await Promise.all([paymentActivity(db), unpaidItemsByTenant(db, ids), paymentsByTenant(db, ids, 200)]);
  const waiting = all.filter((r) => r.status === "waiting" && r.month === month);
  return (
    <>
      <BackLink href="/admin/payments" label="Payments" />
      <PageHeader title={monthLabel(month)} description="Active tenants and whether their rent is paid for this month." />
      {tenants.length === 0 ? <Empty>No active tenants yet.</Empty> : (
        <Table>
          <thead><tr><Th>Tenant</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {tenants.map((t) => {
              const items = (unpaid.get(t.tenantId) ?? []).filter((i) => i.month === month);
              const mine = (paid.get(t.tenantId) ?? []).filter((p) => p.month === month);
              const reported = waiting.filter((r) => r.tenantId === t.tenantId);
              return (
                <tr key={t.tenantId}>
                  <Td><Link className="font-medium hover:underline" href={`/admin/payments/tenant/${t.tenantId}`}>{t.name}</Link></Td>
                  <Td>
                    {!t.rent || t.rent.state === "none" ? <span className="text-muted">{t.invoiceId ? "—" : "No bill yet"}</span> : (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="tabular-nums">{formatINR(t.rent.amount)}</span><Badge kind={t.rent.state} /></div>
                    )}
                    {reported.length > 0 && <span className="mt-1 block text-xs font-medium text-amber-700">Tenant says paid · waiting for you to confirm</span>}
                  </Td>
                  <Td>
                    <RowActions>
                      <Link href={`/admin/payments/tenant/${t.tenantId}`} title="View payments" aria-label="View payments" className={iconButtonClass()}><Eye className="size-4" aria-hidden /></Link>
                      {reported.map((r) => (
                        <span key={r.key} className="inline-flex items-center gap-1">
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
                        </span>
                      ))}
                      <MarkPaidButton name={t.name} items={items} iconOnly />
                      <RevertPaidButton name={t.name} rows={mine.map((p) => ({ id: p.id, what: `Rent · ${monthLabel(p.month)}`, amount: p.amount, paidOn: p.paidOn, method: p.method }))} iconOnly />
                    </RowActions>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
