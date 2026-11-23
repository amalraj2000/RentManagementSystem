import Link from "next/link";
import { Download } from "lucide-react";
import { getDb } from "@/db/client";
import { buttonClass, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { addMonths, currentMonth, formatDate, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { monthParam } from "@/lib/page";
import { MonthPicker } from "@/components/month-picker";
import { monthlySummary, outstandingByTenant } from "@/services/reports";

export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = monthParam((await searchParams).month);
  const db = getDb();
  const [rows, owing] = await Promise.all([monthlySummary(db, addMonths(currentMonth(), -11), currentMonth()), outstandingByTenant(db)]);
  const sel = rows.find((r) => r.month === month);
  const rev = [...rows].reverse();
  return (
    <>
      <PageHeader
        title="Reports"
        description="Cash collected is money actually received (by payment date). Invoiced is what was billed and is not income."
        actions={
          <>
            <MonthPicker value={month} basePath="/admin/reports" />
            <a className={buttonClass("secondary")} href={`/admin/reports/export?month=${month}`}><Download className="size-4" aria-hidden /> Export {monthLabel(month)} CSV</a>
          </>
        }
      />
      {sel && (
        <Card className="mb-5 p-5">
          <h2 className="mb-3 text-sm font-semibold">{monthLabel(month)} summary</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {[
              ["Rent collected", sel.collected.rent], ["Electricity collected", sel.collected.electricity], ["Water collected", sel.collected.water],
              ["Other income", sel.collected.other], ["Total cash collected", sel.collected.total], ["Operating expenses", sel.expenses],
              ["Net cash", sel.net], ["Invoiced (billed)", sel.invoiced], ["Outstanding on this month's invoices", sel.outstanding],
            ].map(([k, v]) => <div key={k as string}><dt className="text-muted">{k}</dt><dd className="font-semibold tabular-nums">{formatINR(v as number)}</dd></div>)}
          </dl>
        </Card>
      )}
      <h2 className="mb-2 text-sm font-semibold">Month-wise (last 12 months)</h2>
      <Table>
        <thead><tr><Th>Month</Th><Th className="text-right">Invoiced</Th><Th className="text-right">Rent</Th><Th className="text-right">Utilities</Th><Th className="text-right">Other</Th><Th className="text-right">Collected</Th><Th className="text-right">Expenses</Th><Th className="text-right">Net</Th></tr></thead>
        <tbody>
          {rev.map((r) => (
            <tr key={r.month}>
              <Td><Link className="font-medium hover:underline" href={`/admin/reports?month=${r.month}`}>{monthLabel(r.month)}</Link></Td>
              <Td className="text-right tabular-nums text-muted">{formatINR(r.invoiced)}</Td>
              <Td className="text-right tabular-nums">{formatINR(r.collected.rent)}</Td>
              <Td className="text-right tabular-nums">{formatINR(r.collected.electricity + r.collected.water)}</Td>
              <Td className="text-right tabular-nums">{formatINR(r.collected.other)}</Td>
              <Td className="text-right font-medium tabular-nums">{formatINR(r.collected.total)}</Td>
              <Td className="text-right tabular-nums">{formatINR(r.expenses)}</Td>
              <Td className={`text-right font-medium tabular-nums ${r.net < 0 ? "text-red-700" : ""}`}>{formatINR(r.net)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Outstanding tenant balances (all months)</h2>
      {owing.length === 0 ? <Card><Empty>No outstanding balances.</Empty></Card> : (
        <Table>
          <thead><tr><Th>Tenant</Th><Th>Oldest due date</Th><Th className="text-right">Balance</Th></tr></thead>
          <tbody>{owing.map((o) => <tr key={o.tenantId}><Td><Link className="hover:underline" href={`/admin/tenants/${o.tenantId}`}>{o.name}</Link></Td><Td>{formatDate(o.oldestDue)}</Td><Td className="text-right font-medium tabular-nums">{formatINR(o.balance)}</Td></tr>)}</tbody>
        </Table>
      )}
    </>
  );
}
