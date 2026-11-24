import Link from "next/link";
import { eq } from "drizzle-orm";
import { invoices } from "@/db/schema";
import { Download } from "lucide-react";
import { MonthPicker } from "@/components/month-picker";
import { buttonClass, Card, Empty, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { addMonths, formatDate, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { monthParam } from "@/lib/page";
import { invoiceBalances, monthlySummary, outstandingByTenant } from "@/services/reports";

export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = monthParam((await searchParams).month);
  const db = getDb();
  // The chosen month plus the 5 before it, so there's always some context.
  const [rows, owing] = await Promise.all([monthlySummary(db, addMonths(month, -5), month), outstandingByTenant(db)]);
  const sel = rows[rows.length - 1];
  const monthBills = await invoiceBalances(db, eq(invoices.periodMonth, month));
  const billed = monthBills.reduce((a, i) => ({ total: a.total + i.totalPaise, due: a.due + i.balance }), { total: 0, due: 0 });
  const history = [...rows].reverse();
  return (
    <>
      <PageHeader
        title="Reports"
        description="Money received and who still owes."
        actions={
          <>
            <MonthPicker value={month} basePath="/admin/reports" />
            <a className={buttonClass("secondary")} href={`/admin/reports/export?month=${month}`}><Download className="size-4" aria-hidden /> Download {monthLabel(month)}</a>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Money received" value={formatINR(sel.collected)} tone="good" hint={sel.collected > 0 ? undefined : "Nothing received yet"} />
        <Stat label="Billed this month" value={formatINR(billed.total)} />
        <Stat label="Still unpaid" value={formatINR(billed.due)} tone={billed.due > 0 ? "warn" : "good"} />
      </div>
      <p className="mt-2 text-xs text-muted">
        “Received” is money actually collected on its payment date. Unpaid bills are not counted as income.
      </p>

      <div className="mt-5">
        <Card>
          <h2 className="flex items-baseline justify-between border-b border-line px-4 py-3 text-sm font-semibold">
            <span>Who still owes</span>
            {owing.length > 0 && <span className="text-xs font-normal text-muted">{formatINR(owing.reduce((a, o) => a + o.balance, 0))}</span>}
          </h2>
          {owing.length === 0 ? <Empty>Everyone is settled up.</Empty> : (
            <ul className="divide-y divide-line">
              {owing.map((o) => (
                <li key={o.tenantId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/admin/tenants/${o.tenantId}`} className="font-medium hover:underline">{o.name}</Link>
                    <p className="text-xs text-muted">Since {formatDate(o.oldestDue)}</p>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">{formatINR(o.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold">Last 6 months</h2>
      <Table compact className="text-xs sm:text-sm [&_td]:px-1.5 [&_th]:px-1.5 sm:[&_td]:px-3 sm:[&_th]:px-3">
        <thead><tr><Th>Month</Th><Th className="text-right">Billed</Th><Th className="text-right">Received</Th><Th className="text-right">Unpaid</Th></tr></thead>
        <tbody>
          {history.map((r) => (
            <tr key={r.month} className={r.month === month ? "bg-accent-soft/30" : ""}>
              <Td><Link className="font-medium hover:underline" href={`/admin/reports?month=${r.month}`}>{monthLabel(r.month)}</Link></Td>
              <Td className="text-right tabular-nums">{formatINR(r.invoiced)}</Td>
              <Td className="text-right tabular-nums">{formatINR(r.collected)}</Td>
              <Td className="text-right tabular-nums">{formatINR(r.outstanding)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
