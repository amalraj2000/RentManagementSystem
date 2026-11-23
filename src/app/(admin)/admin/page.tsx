import Link from "next/link";
import { Plus, CreditCard, FilePlus2 } from "lucide-react";
import { getDb } from "@/db/client";
import { Badge, buttonClass, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { currentMonth, formatDate, monthLabel, todayISO, addMonths } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { dashboardData, monthlySummary } from "@/services/reports";
import { invoiceStatus } from "@/lib/billing";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const db = getDb();
  const month = currentMonth();
  const today = todayISO();
  const [d, summary] = await Promise.all([dashboardData(db, month, today), monthlySummary(db, addMonths(month, -5), month)]);
  const max = Math.max(1, ...summary.flatMap((m) => [m.collected.total, m.expenses]));
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={monthLabel(month)}
        actions={
          <>
            <Link href="/admin/tenants/new" className={buttonClass("secondary")}><Plus className="size-4" aria-hidden /> Add tenant</Link>
            <Link href="/admin/payments/new" className={buttonClass("secondary")}><CreditCard className="size-4" aria-hidden /> Record payment</Link>
            <Link href="/admin/invoices" className={buttonClass()}><FilePlus2 className="size-4" aria-hidden /> Generate bills</Link>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total capacity" value={d.capacity} />
        <Stat label="Current residents" value={d.residents} hint={`${d.capacity ? Math.round((d.residents / d.capacity) * 100) : 0}% occupied`} />
        <Stat label="Available beds" value={d.availableBeds} />
        <Stat label="Rent collected (cash)" value={formatINR(d.rentCollected)} tone="good" hint="Payments received this month" />
        <Stat label="Pending this month" value={formatINR(d.pendingThisMonth)} tone={d.pendingThisMonth ? "warn" : undefined} hint={`All months: ${formatINR(d.outstandingTotal)}`} />
        <Stat label="Electricity bill" value={d.electricity == null ? "Not entered" : formatINR(d.electricity)} />
        <Stat label="Water bill" value={d.water == null ? "Not entered" : formatINR(d.water)} />
        <Stat label="Expenses this month" value={formatINR(d.expenses)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Recent payments</h2>
          {d.recent.length === 0 ? <Empty>No payments yet.</Empty> : (
            <ul className="divide-y divide-line">
              {d.recent.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted">{formatDate(p.paidOn)} · {p.method.replace("_", " ")}</p></div>
                  <span className="font-medium tabular-nums">{formatINR(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Upcoming due dates</h2>
          {d.upcoming.length === 0 ? <Empty>Nothing due soon.</Empty> : (
            <ul className="divide-y divide-line">
              {d.upcoming.map((u) => (
                <li key={u.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div><p className="font-medium">{u.name}</p><p className="text-xs text-muted">Due {formatDate(u.dueDate)}</p></div>
                  <span className="font-medium tabular-nums">{formatINR(Number(u.balance))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Outstanding balances</h2>
          {d.owing.length === 0 ? <Empty>Everyone is settled up.</Empty> : (
            <ul className="divide-y divide-line">
              {d.owing.map((o) => (
                <li key={o.tenantId} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/admin/tenants/${o.tenantId}`} className="font-medium hover:underline">{o.name}</Link>
                    <p className="text-xs text-muted">Oldest due {formatDate(o.oldestDue)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {invoiceStatus({ totalPaise: 1, paidPaise: 0, dueDate: o.oldestDue }, today) === "overdue" && <Badge kind="overdue" />}
                    <span className="font-medium tabular-nums">{formatINR(o.balance)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Income vs expenses · last 6 months</h2>
          <div className="space-y-2.5 p-4">
            {summary.map((m) => (
              <div key={m.month} className="text-xs">
                <div className="mb-1 flex justify-between"><span className="font-medium">{monthLabel(m.month)}</span><span className="text-muted tabular-nums">{formatINR(m.collected.total)} in · {formatINR(m.expenses)} out</span></div>
                <div className="h-1.5 rounded bg-slate-100" role="img" aria-label={`Income ${formatINR(m.collected.total)}`}><div className="h-1.5 rounded bg-accent" style={{ width: `${(m.collected.total / max) * 100}%` }} /></div>
                <div className="mt-1 h-1.5 rounded bg-slate-100" role="img" aria-label={`Expenses ${formatINR(m.expenses)}`}><div className="h-1.5 rounded bg-slate-400" style={{ width: `${(m.expenses / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
