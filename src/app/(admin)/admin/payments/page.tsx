import Link from "next/link";
import { Eye, ImageIcon, Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { Badge, buttonClass, EditLink, iconButtonClass, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { approveClaimAction, rejectClaimAction, voidPaymentAction } from "@/actions/admin";
import { Field, Input } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR, paiseToInput } from "@/lib/money";
import { methodLabel } from "@/lib/payment-methods";
import { purposeLabel } from "@/lib/billing";
import { pageParam, slicePage } from "@/lib/page";
import { requireAdmin } from "@/lib/session";
import { MarkPaidButton } from "@/components/mark-paid-button";
import { RevertPaidButton } from "@/components/revert-paid-button";
import { MonthPicker } from "@/components/month-picker";
import { monthParam } from "@/lib/page";
import { currentMonth, todayISO } from "@/lib/dates";
import { paymentBoard, paymentsByTenant, unpaidItemsByTenant } from "@/services/reports";
import { type ActivityFilter, FILTERS, filterCounts, matchesFilter, paymentActivity } from "@/services/payment-activity";

export const metadata = { title: "Payments" };

const TAB_LABEL: Record<ActivityFilter, string> = { all: "All payments", waiting: "Waiting for confirmation", paid: "Paid", cancelled: "Cancelled" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string; show?: string; month?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const board = !sp.show || sp.show === "tenants"; // the default view: active tenants and whether they have paid
  const show: ActivityFilter = (FILTERS as string[]).includes(sp.show ?? "") ? (sp.show as ActivityFilter) : "all";
  const month = monthParam(sp.month);
  const all = await paymentActivity(getDb());
  const counts = filterCounts(all);
  const { items, total, page } = slicePage(all.filter((r) => matchesFilter(r, show)), pageParam(sp.page));
  const tabHref = (f: ActivityFilter) => `/admin/payments?show=${f}`;
  const today = todayISO();
  const tenants = board ? await paymentBoard(getDb(), month, today) : [];
  const waitingBy = new Map<string, number>();
  for (const r of all) if (r.status === "waiting") waitingBy.set(r.tenantId, (waitingBy.get(r.tenantId) ?? 0) + 1);
  const ids = tenants.map((t) => t.tenantId); // empty when not on the tenants view, so nothing extra is fetched
  const [unpaid, paid] = await Promise.all([unpaidItemsByTenant(getDb(), ids), paymentsByTenant(getDb(), ids, 200)]);
  return (
    <>
      <PageHeader
        title="Payments"
        description={board ? `Who has paid for ${monthLabel(month)}` : "Payments you recorded and payments tenants say they made — all in one place."}
        actions={<>{board && <MonthPicker value={month} basePath="/admin/payments" />}<Link href="/admin/payments/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Record payment</Link></>}
      />
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter payments">
        <Link href="/admin/payments" role="tab" aria-selected={board} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${board ? "bg-accent-soft text-accent" : "text-slate-600 hover:bg-slate-100"}`}>Tenants</Link>
        {FILTERS.map((f) => (
          <Link key={f} href={tabHref(f)} role="tab" aria-selected={!board && show === f} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${!board && show === f ? "bg-accent-soft text-accent" : "text-slate-600 hover:bg-slate-100"}`}>
            {TAB_LABEL[f]}
            <span className={`rounded-full px-1.5 text-[11px] font-semibold ${f === "waiting" && counts.waiting > 0 ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"}`}>{counts[f]}</span>
          </Link>
        ))}
      </div>
      {board ? (
        tenants.length === 0 ? <Empty>No active tenants yet.</Empty> : (
          <Table>
            <thead><tr><Th>Tenant</Th><Th>Rent</Th><Th>Expenses</Th><Th className="text-right">Action</Th></tr></thead>
            <tbody>
              {tenants.map((t) => {
                const items = (unpaid.get(t.tenantId) ?? []).filter((i) => i.month === month);
                const mine = (paid.get(t.tenantId) ?? []).filter((p) => p.month === month);
                return (
                  <tr key={t.tenantId}>
                    <Td>
                      <Link className="font-medium hover:underline" href={`/admin/payments/tenant/${t.tenantId}`}>{t.name}</Link>
                      {(waitingBy.get(t.tenantId) ?? 0) > 0 && <Link href={`/admin/payments/tenant/${t.tenantId}`} className="mt-1 block text-xs font-medium text-amber-700 hover:underline">{waitingBy.get(t.tenantId)} waiting for you to confirm</Link>}
                    </Td>
                    <Td>
                      {!t.rent || t.rent.state === "none" ? <span className="text-muted">{t.invoiceId ? "—" : "No bill yet"}</span> : (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="tabular-nums">{formatINR(t.rent.amount)}</span><Badge kind={t.rent.state} /></div>
                      )}
                    </Td>
                    <Td className="!whitespace-normal">
                      {t.expenseLines.length === 0 ? <span className="text-muted">—</span> : (
                        <ul className="space-y-1">
                          {t.expenseLines.map((l, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-x-2 text-sm"><span>{l.label}</span><span className="tabular-nums text-muted">{formatINR(l.amount)}</span><Badge kind={l.paid ? "paid" : "unpaid"} /></li>
                          ))}
                        </ul>
                      )}
                    </Td>
                    <Td>
                      <RowActions>
                        <Link href={`/admin/payments/tenant/${t.tenantId}`} title="View payments" aria-label="View payments" className={iconButtonClass()}><Eye className="size-4" aria-hidden /></Link>
                        <MarkPaidButton name={t.name} items={items} />
                        <RevertPaidButton name={t.name} rows={mine.map((p) => ({ id: p.id, what: `${p.what} · ${monthLabel(p.month)}`, amount: p.amount, paidOn: p.paidOn, method: p.method }))} />
                      </RowActions>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )
      ) : total === 0 ? <Empty>{show === "all" ? "No payments yet." : "Nothing here."}</Empty> : (
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
      {!board && <Pager page={page} total={total} basePath="/admin/payments" params={{ show: show === "all" ? undefined : show }} />}
    </>
  );
}
