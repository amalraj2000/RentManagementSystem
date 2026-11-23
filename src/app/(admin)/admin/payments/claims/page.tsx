import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { Field, Input } from "@/components/ui";
import { Badge, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { approveClaimAction, rejectClaimAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR, paiseToInput } from "@/lib/money";
import { offsetFor, PAGE_SIZE, pageParam } from "@/lib/page";
import { adminClaims, countClaims } from "@/services/claims";

export const metadata = { title: "Reported payments" };

const TABS = [["pending", "Waiting"], ["approved", "Confirmed"], ["rejected", "Rejected"], ["all", "All"]] as const;

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const status = (TABS.map((t) => t[0]) as string[]).includes(sp.status ?? "") ? (sp.status as (typeof TABS)[number][0]) : "pending";
  const [rows, total] = await Promise.all([adminClaims(getDb(), status, PAGE_SIZE, offsetFor(page)), countClaims(getDb(), status)]);
  return (
    <>
      <BackLink href="/admin/payments" label="Payments" />
      <PageHeader title="Reported payments" description="Payments tenants say they made. Nothing counts as paid until you confirm it — check your bank/UPI and the screenshot first." />
      <div className="mb-3 flex gap-1.5" role="tablist">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/payments/claims?status=${k}`} role="tab" aria-selected={status === k} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${status === k ? "bg-accent-soft text-accent" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>
        ))}
      </div>
      {rows.length === 0 ? <Empty>Nothing here.</Empty> : (
        <Table>
          <thead><tr><Th>Reported</Th><Th>Tenant</Th><Th>For</Th><Th className="text-right">Amount</Th><Th>Method</Th><Th>Proof</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {rows.slice(0, PAGE_SIZE).map((c) => (
              <tr key={c.id}>
                <Td>{formatDate(c.paidOn)}</Td>
                <Td><Link href={`/admin/tenants/${c.tenantId}`} className="font-medium hover:underline">{c.tenantName}</Link>{c.note && <span className="block text-xs text-muted">{c.note}</span>}</Td>
                <Td><Link href={`/admin/invoices/${c.invoiceId}`} className="hover:underline">{monthLabel(c.month)}</Link></Td>
                <Td className="text-right tabular-nums">{formatINR(c.amountPaise)}</Td>
                <Td>{c.method.replace("_", " ")}{c.reference ? ` · ${c.reference}` : ""}</Td>
                <Td>{Number(c.hasShot) ? <a href={`/api/claims/${c.id}`} target="_blank" rel="noopener" title="View screenshot" aria-label="View screenshot" className="inline-flex text-accent hover:text-accent-hover"><ImageIcon className="size-4" aria-hidden /></a> : <span className="text-muted">—</span>}</Td>
                <Td>
                  <Badge kind={c.status === "approved" ? "confirmed" : c.status} />
                  {c.status === "rejected" && c.rejectReason && <span className="block max-w-40 whitespace-normal text-xs text-muted">{c.rejectReason}</span>}
                </Td>
                <Td>
                  {c.status === "pending" && (
                    <RowActions>
                      <ConfirmButton
                        label="Approve"
                        variant="primary"
                        title={`Confirm ${formatINR(c.amountPaise)} from ${c.tenantName}?`}
                        body="This records a real payment and issues a receipt. Only confirm once you've seen the money arrive."
                        confirmLabel="Confirm payment"
                        extra={<div className="mt-3"><Field label="Amount received (₹)" hint={`Outstanding on this bill: ${formatINR(Number(c.balance))}`}><Input name="amount" inputMode="decimal" required defaultValue={paiseToInput(Math.min(c.amountPaise, Math.max(Number(c.balance), 0)))} /></Field></div>}
                        action={approveClaimAction.bind(null, c.id)}
                      />
                      <ConfirmButton label="Reject" title="Reject this report?" body="The tenant is told why." withReason confirmLabel="Reject" action={rejectClaimAction.bind(null, c.id)} />
                    </RowActions>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={total} basePath="/admin/payments/claims" params={{ status }} />
    </>
  );
}
