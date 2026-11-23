import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { Badge, buttonClass, Card, Empty, PageHeader, Pager } from "@/components/ui";
import { pageParam, slicePage } from "@/lib/page";
import { getDb } from "@/db/client";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { myClaims } from "@/services/claims";
import { myPayments } from "@/services/portal";

export const metadata = { title: "Payments" };

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
      <PageHeader title="My payments" description={pays.length ? `${pays.length} payment${pays.length > 1 ? "s" : ""} · ${formatINR(total)} paid in total` : undefined} actions={<Link href="/portal" className={buttonClass("secondary")}>Pay / report a payment</Link>} />

      {reports.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold">Payments you reported</h2>
          <Card className="mb-6">
            <ul className="divide-y divide-line">
              {reports.map((c) => (
                <li key={c.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium tabular-nums">{formatINR(c.amountPaise)} <span className="font-normal text-muted">· {monthLabel(c.month)}</span></p>
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
      <Card>
        {pays.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
          <ul className="divide-y divide-line">
            {pagePays.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div><p className="font-medium tabular-nums">{formatINR(p.amountPaise)}</p><p className="text-xs text-muted">{formatDate(p.paidOn)} · {p.method.replace("_", " ")} · for {monthLabel(p.periodMonth)}</p></div>
                <Link href={`/receipt/${p.id}`} className="font-medium text-accent hover:underline">{p.receiptNo}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pager page={current} total={payCount} basePath="/portal/payments" />
    </>
  );
}
