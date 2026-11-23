import Link from "next/link";
import { Download } from "lucide-react";
import { MonthPicker } from "@/components/month-picker";
import { buttonClass, Card, Empty, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { categoryLabel } from "@/lib/categories";
import { addMonths, formatDate, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { monthParam } from "@/lib/page";
import { monthlySummary, outstandingByTenant } from "@/services/reports";

export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = monthParam((await searchParams).month);
  const db = getDb();
  // The chosen month plus the 5 before it, so there's always some context.
  const [rows, owing] = await Promise.all([monthlySummary(db, addMonths(month, -5), month), outstandingByTenant(db)]);
  const sel = rows[rows.length - 1];
  const history = [...rows].reverse();
  const parts = [
    ["Rent", sel.collected.rent],
    ["Utilities", sel.collected.electricity + sel.collected.water],
    ["Other", sel.collected.other],
  ].filter(([, v]) => (v as number) > 0) as [string, number][];
  const spent = Object.entries(sel.expensesByCategory).sort((a, b) => b[1] - a[1]);
  const owedTotal = owing.reduce((a, o) => a + o.balance, 0);
  return (
    <>
      <PageHeader
        title="Reports"
        description="Money received, money spent, and who still owes."
        actions={
          <>
            <MonthPicker value={month} basePath="/admin/reports" />
            <a className={buttonClass("secondary")} href={`/admin/reports/export?month=${month}`}><Download className="size-4" aria-hidden /> Download {monthLabel(month)}</a>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Money received" value={formatINR(sel.collected.total)} tone="good" hint={parts.length ? parts.map(([k, v]) => `${k} ${formatINR(v)}`).join(" · ") : "Nothing received yet"} />
        <Stat label="Money spent" value={formatINR(sel.expenses)} hint={spent.length ? `${spent.length} categor${spent.length > 1 ? "ies" : "y"}` : "No expenses"} />
        <Stat label="Left over" value={formatINR(sel.net)} tone={sel.net < 0 ? "warn" : "good"} hint={sel.net < 0 ? "Spent more than received" : "Received minus spent"} />
      </div>
      <p className="mt-2 text-xs text-muted">
        “Received” is money actually collected on its payment date. Bills raised this month: {formatINR(sel.invoiced)}, of which {formatINR(sel.outstanding)} is still unpaid (not counted as income).
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Where the money went · {monthLabel(month)}</h2>
          {spent.length === 0 ? <Empty>No expenses this month.</Empty> : (
            <ul className="divide-y divide-line">
              {spent.map(([cat, amt]) => (
                <li key={cat} className="px-4 py-2.5 text-sm">
                  <div className="flex justify-between"><span>{categoryLabel(cat)}</span><span className="font-medium tabular-nums">{formatINR(amt)}</span></div>
                  <div className="mt-1.5 h-1.5 rounded bg-slate-100" aria-hidden><div className="h-1.5 rounded bg-slate-400" style={{ width: `${Math.max((amt / sel.expenses) * 100, 3)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="flex items-baseline justify-between border-b border-line px-4 py-3 text-sm font-semibold">
            <span>Who still owes</span>
            {owing.length > 0 && <span className="text-xs font-normal text-muted">Total {formatINR(owedTotal)}</span>}
          </h2>
          {owing.length === 0 ? <Empty>Everyone is settled up.</Empty> : (
            <ul className="divide-y divide-line">
              {owing.map((o) => (
                <li key={o.tenantId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/admin/tenants/${o.tenantId}`} className="font-medium hover:underline">{o.name}</Link>
                    <p className="text-xs text-muted">Since {formatDate(o.oldestDue)}</p>
                  </div>
                  <span className="font-medium tabular-nums">{formatINR(o.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold">Last 6 months</h2>
      <Table compact className="text-xs sm:text-sm [&_td]:px-1.5 [&_th]:px-1.5 sm:[&_td]:px-3 sm:[&_th]:px-3">
        <thead><tr><Th>Month</Th><Th className="text-right">Received</Th><Th className="text-right">Spent</Th><Th className="text-right">Left over</Th></tr></thead>
        <tbody>
          {history.map((r) => (
            <tr key={r.month} className={r.month === month ? "bg-accent-soft/30" : ""}>
              <Td><Link className="font-medium hover:underline" href={`/admin/reports?month=${r.month}`}>{monthLabel(r.month)}</Link></Td>
              <Td className="text-right tabular-nums">{formatINR(r.collected.total)}</Td>
              <Td className="text-right tabular-nums">{formatINR(r.expenses)}</Td>
              <Td className={`text-right font-medium tabular-nums ${r.net < 0 ? "text-red-700" : ""}`}>{formatINR(r.net)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
