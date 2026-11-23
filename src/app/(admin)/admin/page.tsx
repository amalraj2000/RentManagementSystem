import Link from "next/link";
import { Plus, CreditCard, FilePlus2 } from "lucide-react";
import { getDb } from "@/db/client";
import { Badge, buttonClass, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { currentMonth, formatDate, monthLabel, todayISO, addMonths } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { dashboardData, expenseByCategory, monthlySummary, unpaidThisMonth } from "@/services/reports";
import { invoiceStatus } from "@/lib/billing";
import { SplitAmount } from "@/components/split-amount";
import { ConfirmButton } from "@/components/action-form";
import { ChoiceChips, METHOD_CHOICES } from "@/components/choice-chips";
import { categoryLabel } from "@/lib/categories";
import { markPaidAction } from "@/actions/admin";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const db = getDb();
  const month = currentMonth();
  const today = todayISO();
  const [d, summary, byCat, unpaid] = await Promise.all([dashboardData(db, month, today), monthlySummary(db, addMonths(month, -5), month), expenseByCategory(db, month), unpaidThisMonth(db, month)]);
  const markPaid = (invoiceId: string, target: string, what: string, name: string, amount: number) => (
    <ConfirmButton
      label="Mark paid"
      variant="primary"
      title={`Mark ${what} as paid?`}
      body={`${name} · ${formatINR(amount)}. This records the full amount as received today.`}
      confirmLabel="Mark paid"
      action={markPaidAction.bind(null, invoiceId, target)}
      extra={<div className="mt-3"><span className="mb-1.5 block text-sm font-medium">How was it paid?</span><ChoiceChips name="method" label="How was it paid" options={METHOD_CHOICES} defaultValue="upi" /></div>}
    />
  );
  const cats = [["electricity", "Electricity"], ["water", "Water"], ["cooking_gas", "Gas cylinder"], ...(byCat.other.billed ? [["other", "Other"]] : [])] as const;
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
      <div className="grid grid-cols-3 gap-3">
        <Stat compact label="Capacity" value={d.capacity} />
        <Stat compact label="Residents" value={d.residents} hint={`${d.capacity ? Math.round((d.residents / d.capacity) * 100) : 0}% occupied`} />
        <Stat compact label="Available beds" value={d.availableBeds} />
      </div>

      <section aria-labelledby="rent-h" className="mt-6">
        <h2 id="rent-h" className="mb-2 text-sm font-semibold">Rent · {monthLabel(month)}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Rent billed" value={formatINR(d.split.rentBilled)} />
          <Stat label="Rent collected" value={formatINR(d.split.rentCollected)} tone="good" />
          <Stat label="Rent pending" value={formatINR(d.split.rentPending)} tone={d.split.rentPending ? "warn" : "good"} />
        </div>
      </section>

      <section aria-labelledby="exp-h" className="mt-6">
        <h2 id="exp-h" className="mb-2 text-sm font-semibold">Expenses · {monthLabel(month)}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Spent by you" value={formatINR(d.expenses)} hint="All expenses you recorded" />
          <Stat label="Charged to tenants" value={formatINR(d.split.expenseBilled)} hint="Their share of expenses" />
          <Stat label="Collected from tenants" value={formatINR(d.split.expenseCollected)} tone="good" />
          <Stat label="Pending from tenants" value={formatINR(d.split.expensePending)} tone={d.split.expensePending ? "warn" : "good"} />
        </div>
        {/* each expense on its own: what tenants were charged, have paid and still owe */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {cats.map(([key, name]) => {
            const c = byCat[key];
            return (
              <Card key={key} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{name}</h3>
                  {c.billed > 0 && <Badge kind={c.pending === 0 ? "paid" : c.collected > 0 ? "partial" : "unpaid"} />}
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(c.billed)}</p>
                <p className="mt-1 text-xs text-muted">Collected {formatINR(c.collected)} · <span className={c.pending ? "font-medium text-amber-700" : ""}>pending {formatINR(c.pending)}</span></p>
              </Card>
            );
          })}
        </div>
      </section>
      {unpaid.length > 0 && (
        <section aria-labelledby="unpaid-h" className="mt-6">
          <h2 id="unpaid-h" className="mb-1 text-sm font-semibold">Unpaid this month</h2>
          <p className="mb-2 text-xs text-muted">Tenant already paid you? Tap <strong>Mark paid</strong>. Rent and each expense are marked separately.</p>
          <Card>
            <ul className="divide-y divide-line">
              {unpaid.map((u) => (
                <li key={u.invoiceId} className="px-4 py-3">
                  <Link href={`/admin/tenants/${u.tenantId}`} className="text-sm font-semibold hover:underline">{u.name}</Link>
                  <ul className="mt-1.5 space-y-1.5">
                    {u.rentBalance > 0 && (
                      <li className="flex items-center justify-between gap-3 text-sm">
                        <span>Rent <span className="tabular-nums text-muted">· {formatINR(u.rentBalance)}</span></span>
                        {markPaid(u.invoiceId, "rent", "rent", u.name, u.rentBalance)}
                      </li>
                    )}
                    {u.lines.map((l) => (
                      <li key={l.itemId} className="flex items-center justify-between gap-3 text-sm">
                        <span>{categoryLabel(l.category)} <span className="tabular-nums text-muted">· {formatINR(l.balance)}</span></span>
                        {markPaid(u.invoiceId, l.itemId, categoryLabel(l.category).toLowerCase(), u.name, l.balance)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
      {(() => {
        // unpaid from earlier months, rent and expenses kept apart
        const oldRent = d.owing.reduce((a, o) => a + o.rent, 0) - d.split.rentPending;
        const oldExp = d.owing.reduce((a, o) => a + o.expense, 0) - d.split.expensePending;
        return oldRent > 0 || oldExp > 0 ? <p className="mt-3 text-xs text-muted">Unpaid from earlier months: {[oldRent > 0 && `Rent ${formatINR(oldRent)}`, oldExp > 0 && `Expenses ${formatINR(oldExp)}`].filter(Boolean).join(" · ")} (see “Outstanding balances” below).</p> : null;
      })()}

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
                  <SplitAmount rent={u.rent} expense={u.expense} />
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
                    <SplitAmount rent={o.rent} expense={o.expense} />
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
