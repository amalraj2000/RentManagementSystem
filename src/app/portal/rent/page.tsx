import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Pager } from "@/components/ui";
import { getDb } from "@/db/client";
import { balanceOf, rentState } from "@/lib/billing";
import { currentMonth, formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { pageParam, slicePage } from "@/lib/page";
import { requireTenant } from "@/lib/session";
import { myClaims } from "@/services/claims";
import { myRentLedger } from "@/services/portal";

export const metadata = { title: "Rent" };

const th = "whitespace-nowrap border-b border-line bg-slate-50 px-2 py-2.5 text-xs font-medium text-muted sm:px-4";
const td = "border-b border-line px-2 py-3 align-middle sm:px-4";

export default async function PortalRent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireTenant();
  const page = pageParam((await searchParams).page);
  const db = getDb();
  const [ledger, claims] = await Promise.all([myRentLedger(db, user.id, currentMonth()), myClaims(db, user.id, 100)]);
  if (!ledger) return <Card><Empty>No tenant profile found.</Empty></Card>;
  const today = todayISO();
  const { items, total, page: current } = slicePage(ledger.months, page);
  const waiting = (invoiceId: string) => claims.filter((c) => c.invoiceId === invoiceId && c.status === "pending").reduce((a, c) => a + c.amountPaise, 0);
  return (
    <>
      <PageHeader title="Rent" description={`Since you joined on ${formatDate(ledger.tenant.joiningDate)}`} />
      {total === 0 ? <Card><Empty>Nothing to show yet.</Empty></Card> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr><th className={th}>Month</th><th className={`${th} text-right`}>Rent</th><th className={th}>Status</th><th className={`${th} text-right`}>Action</th></tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-b-0">
              {items.map(({ month, invoice: inv }) => {
                if (!inv) {
                  return (
                    <tr key={month}>
                      <td className={`${td} font-medium`}>{monthLabel(month)}</td>
                      <td className={`${td} text-right tabular-nums text-muted`}>{formatINR(ledger.tenant.monthlyRentPaise)}</td>
                      <td className={`${td} text-xs text-muted`}>Not billed yet</td>
                      <td className={`${td} text-right text-muted`}>—</td>
                    </tr>
                  );
                }
                const pending = waiting(inv.id);
                const state = rentState(inv, pending, today);
                const canPay = balanceOf(inv) - pending > 0;
                return (
                  <tr key={month}>
                    <td className={td}>
                      <Link href={`/portal/invoices/${inv.id}`} className="font-medium hover:underline">{monthLabel(month)}</Link>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{formatINR(inv.totalPaise)}</td>
                    <td className={td}><Badge kind={state} wrap /></td>
                    <td className={`${td} text-right`}>
                      {canPay ? (
                        <Link href={`/portal/invoices/${inv.id}/pay`} className="inline-flex h-8 items-center justify-center rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover">Pay</Link>
                      ) : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Pager page={current} total={total} basePath="/portal/rent" />
      <p className="mt-3 text-xs text-muted">Tap <strong>Pay</strong> after you pay the owner. The month shows <strong>Paid</strong> once they confirm it.</p>
    </>
  );
}
