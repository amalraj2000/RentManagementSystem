import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { Badge, buttonClass, Card, Empty, PageHeader, Pager } from "@/components/ui";
import { pageParam, slicePage } from "@/lib/page";
import { getDb } from "@/db/client";
import { formatDate, formatDateShort, monthLabel, monthLabelShort } from "@/lib/dates";
import { methodLabel } from "@/lib/payment-methods";
import { purposeLabel } from "@/lib/billing";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { myClaims } from "@/services/claims";
import { myPayments } from "@/services/portal";

export const metadata = { title: "Payments" };

const th = "whitespace-nowrap border-b border-line bg-slate-50 px-1 py-2.5 text-xs font-medium text-muted sm:px-4";
const td = "border-b border-line px-1 py-3 align-middle text-[13px] sm:px-4 sm:text-sm";

export default async function PortalPayments({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireTenant();
  const page = pageParam((await searchParams).page);
  const db = getDb();
  const [pays, claims] = await Promise.all([myPayments(db, user.id, 100), myClaims(db, user.id, 20)]);
  const { items: pagePays, total: payCount, page: current } = slicePage(pays, page);
  const total = pays.reduce((a, p) => a + p.amountPaise, 0);
  const reports = claims.filter((c) => c.status !== "approved"); // approved ones already appear below as real payments
  return (
    <>
      <PageHeader title="My payments" description={pays.length ? `${pays.length} payment${pays.length > 1 ? "s" : ""} · ${formatINR(total)} paid in total` : undefined} actions={<Link href="/portal/rent" className={buttonClass("secondary")}>Pay rent</Link>} />

      {reports.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold">Payments you reported</h2>
          <Card className="mb-6">
            <ul className="divide-y divide-line">
              {reports.map((c) => (
                <li key={c.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium tabular-nums">{formatINR(c.amountPaise)} <span className="font-normal text-muted">· {purposeLabel(c.purpose)} · {monthLabel(c.month)}</span></p>
                      <p className="text-xs text-muted">{formatDate(c.paidOn)} · {c.method.replace("_", " ")}{c.reference ? ` · ${c.reference}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {Number(c.hasShot) ? <a href={`/api/claims/${c.id}`} target="_blank" rel="noopener" aria-label="View your screenshot" title="View screenshot" className="text-accent"><ImageIcon className="size-4" aria-hidden /></a> : null}
                      <Badge kind={c.status} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">{c.status === "pending" ? "Waiting for the owner to confirm. Your bill will update once they do." : `Not accepted: ${c.rejectReason ?? "no reason given"}`}</p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <h2 className="mb-2 text-sm font-semibold">Payment history</h2>
      {pays.length === 0 ? <Card><Empty>No payments recorded yet.</Empty></Card> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className={th}>Month</th><th className={`${th} text-right`}>Price</th><th className={th}>Date paid</th><th className={th}>Mode</th><th className={`${th} text-right`}>Receipt</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-b-0">
              {pagePays.map((p) => (
                <tr key={p.id}>
                  <td className={`${td} whitespace-nowrap font-medium`}>
                    <span className="sm:hidden">{monthLabelShort(p.periodMonth)}</span>
                    <span className="hidden sm:inline">{monthLabel(p.periodMonth)}</span>
                    <span className="block text-[11px] font-normal text-muted">{purposeLabel(p.purpose)}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{formatINR(p.amountPaise)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="sm:hidden">{formatDateShort(p.paidOn)}</span>
                    <span className="hidden sm:inline">{formatDate(p.paidOn)}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{methodLabel(p.method)}</td>
                  <td className={`${td} text-right`}><Link href={`/receipt/${p.id}`} className="font-medium text-accent hover:underline">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pager page={current} total={payCount} basePath="/portal/payments" />
    </>
  );
}
