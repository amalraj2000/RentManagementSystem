import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Pager } from "@/components/ui";
import { getDb } from "@/db/client";
import { categoryLabel } from "@/lib/categories";
import { monthLabel, monthLabelShort, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { pageParam, slicePage } from "@/lib/page";
import { requireTenant } from "@/lib/session";
import { mySharedItems } from "@/services/portal";

export const metadata = { title: "Expenses" };

const th = "whitespace-nowrap border-b border-line bg-slate-50 px-1 py-2.5 text-xs font-medium text-muted sm:px-4";
const td = "border-b border-line px-1 py-3 align-middle text-[13px] sm:px-4 sm:text-sm";

export default async function PortalExpenses({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireTenant();
  const page = pageParam((await searchParams).page);
  const db = getDb();
  const items = await mySharedItems(db, user.id);
  const { items: rows, total, page: current } = slicePage(items, page);
  const today = todayISO();
  return (
    <>
      <PageHeader title="Expenses" description="Your share of shared expenses and utility bills" />
      {total === 0 ? <Card><Empty>No shared expenses yet.</Empty></Card> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr><th className={th}>Month</th><th className={th}>Category</th><th className={`${th} text-right`}>Price</th><th className={th}>Status</th><th className={`${th} text-right`}>Action</th></tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-b-0">
              {rows.map((i) => {
                // each expense is its own line: only reports made for THIS expense count here
                // Paid · Waiting for confirmation · Overdue · Partly paid · Unpaid
                const state = i.status === "paid" ? "paid" : i.pending >= i.balance && i.balance > 0 ? "waiting" : today > i.dueDate ? "overdue" : i.status === "partial" ? "partial" : "unpaid";
                const claimable = Math.max(i.balance - i.pending, 0);
                return (
                  <tr key={i.itemId}>
                    <td className={`${td} whitespace-nowrap font-medium`}>
                      <span className="sm:hidden">{monthLabelShort(i.month)}</span>
                      <span className="hidden sm:inline">{monthLabel(i.month)}</span>
                    </td>
                    <td className={td}>
                      <p className="font-medium leading-tight">{categoryLabel(i.category)}</p>
                      {(() => { const detail = i.description.replace(/^[^:–]+[:–]\s*/, ""); return detail && detail !== categoryLabel(i.category) && detail !== i.description ? <p className="mt-0.5 hidden text-[11px] leading-tight text-muted sm:block">{detail}</p> : null; })()}
                    </td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{formatINR(i.amountPaise)}</td>
                    <td className={td}><Badge kind={state} wrap /></td>
                    <td className={`${td} text-right`}>
                      {state !== "paid" && claimable > 0 ? (
                        <Link
                          href={`/portal/invoices/${i.invoiceId}/pay?${new URLSearchParams({ for: "expense", item: i.itemId, amount: String(claimable) })}`}
                          className="inline-flex h-8 items-center justify-center rounded-lg bg-accent px-2.5 text-xs font-medium text-white hover:bg-accent-hover sm:px-3"
                        >Pay</Link>
                      ) : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Pager page={current} total={total} basePath="/portal/expenses" />
      <p className="mt-3 text-xs text-muted">These shares are part of your monthly bill. Tap <strong>Pay</strong> after you pay the owner; it shows <strong>Paid</strong> once they confirm.</p>
    </>
  );
}
