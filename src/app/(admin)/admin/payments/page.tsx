import Link from "next/link";
import { ImageIcon, Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { Badge, buttonClass, EditLink, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { approveClaimAction, rejectClaimAction, voidPaymentAction } from "@/actions/admin";
import { Field, Input } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR, paiseToInput } from "@/lib/money";
import { methodLabel } from "@/lib/payment-methods";
import { purposeLabel } from "@/lib/billing";
import { pageParam, slicePage } from "@/lib/page";
import { requireAdmin } from "@/lib/session";
import { type ActivityFilter, FILTERS, filterCounts, matchesFilter, paymentActivity } from "@/services/payment-activity";

export const metadata = { title: "Payments" };

const TAB_LABEL: Record<ActivityFilter, string> = { all: "All", waiting: "Waiting for confirmation", paid: "Paid", cancelled: "Cancelled" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string; show?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const show: ActivityFilter = (FILTERS as string[]).includes(sp.show ?? "") ? (sp.show as ActivityFilter) : "all"; // "All" is the default
  const all = await paymentActivity(getDb());
  const counts = filterCounts(all);
  const { items, total, page } = slicePage(all.filter((r) => matchesFilter(r, show)), pageParam(sp.page));
  const tabHref = (f: ActivityFilter) => (f === "all" ? "/admin/payments" : `/admin/payments?show=${f}`);
  return (
    <>
      <PageHeader
        title="Payments"
        description="Payments you recorded and payments tenants say they made — all in one place."
        actions={<Link href="/admin/payments/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Record payment</Link>}
      />
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter payments">
        {FILTERS.map((f) => (
          <Link key={f} href={tabHref(f)} role="tab" aria-selected={show === f} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${show === f ? "bg-accent-soft text-accent" : "text-slate-600 hover:bg-slate-100"}`}>
            {TAB_LABEL[f]}
            <span className={`rounded-full px-1.5 text-[11px] font-semibold ${f === "waiting" && counts.waiting > 0 ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"}`}>{counts[f]}</span>
          </Link>
        ))}
      </div>
      {total === 0 ? <Empty>{show === "all" ? "No payments yet." : "Nothing here."}</Empty> : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Tenant</Th><Th>For</Th><Th className="text-right">Amount</Th><Th>Mode</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.key} className={r.status === "cancelled" || r.status === "rejected" ? "text-muted" : ""}>
                <Td>{formatDate(r.date)}</Td>
                <Td><Link href={`/admin/tenants/${r.tenantId}`} className="font-medium hover:underline">{r.tenantName}</Link>{r.kind === "claim" && r.note && <span className="block max-w-48 whitespace-normal text-xs font-normal text-muted">{r.note}</span>}</Td>
                <Td><Link className="hover:underline" href={`/admin/invoices/${r.invoiceId}`}>{monthLabel(r.month)}</Link><span className="block text-xs text-muted">{purposeLabel(r.purpose)}</span></Td>
                <Td className={`text-right tabular-nums ${r.status === "cancelled" ? "line-through" : ""}`}>{formatINR(r.amountPaise)}</Td>
                <Td>{methodLabel(r.method)}{r.reference ? <span className="block text-xs text-muted">{r.reference}</span> : null}</Td>
                <Td>
                  <Badge kind={r.status} wrap />
                  {(r.status === "rejected" || r.status === "cancelled") && r.rejectReason && <span className="mt-0.5 block max-w-40 whitespace-normal text-xs text-muted">{r.rejectReason}</span>}
                </Td>
                <Td>
                  <RowActions>
                    {r.hasProof && <a href={`/api/claims/${r.id}`} target="_blank" rel="noopener" title="View screenshot" aria-label="View screenshot" className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-white text-accent hover:bg-slate-50"><ImageIcon className="size-4" aria-hidden /></a>}
                    {r.status === "waiting" && (
                      <>
                        <ConfirmButton
                          label="Approve"
                          variant="primary"
                          title={`Confirm ${purposeLabel(r.purpose).toLowerCase()} ${formatINR(r.amountPaise)} from ${r.tenantName}?`}
                          body="This records a real payment and issues a receipt. Only confirm once you've seen the money arrive."
                          confirmLabel="Confirm payment"
                          extra={<div className="mt-3"><Field label="Amount received (₹)" hint={`Still due on this bill: ${formatINR(Math.max(r.balance, 0))}`}><Input name="amount" inputMode="decimal" required defaultValue={paiseToInput(Math.min(r.amountPaise, Math.max(r.balance, 0)))} /></Field></div>}
                          action={approveClaimAction.bind(null, r.id)}
                        />
                        <ConfirmButton label="Reject" title="Reject this report?" body="The tenant is told why." withReason confirmLabel="Reject" action={rejectClaimAction.bind(null, r.id)} />
                      </>
                    )}
                    {r.status === "paid" && (
                      <>
                        <Link href={`/receipt/${r.id}`} className="px-1 text-xs font-medium text-accent hover:underline">Receipt</Link>
                        <EditLink href={`/admin/payments/${r.id}/edit`} />
                        <ConfirmButton label="Void" title="Cancel this payment?" body="It stays in the records, marked cancelled, but no longer counts as money received." withReason action={voidPaymentAction.bind(null, r.id)} confirmLabel="Cancel payment" />
                      </>
                    )}
                  </RowActions>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={total} basePath="/admin/payments" params={{ show: show === "all" ? undefined : show }} />
    </>
  );
}
