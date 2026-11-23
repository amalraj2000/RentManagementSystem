import Link from "next/link";
import { Plus, CreditCard, FilePlus2 } from "lucide-react";
import { getDb } from "@/db/client";
import { Badge, buttonClass, Card, PageHeader, Stat } from "@/components/ui";
import { currentMonth, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { expenseByCategory, rentVsExpenses } from "@/services/reports";
import { AddTenantButton } from "@/components/add-tenant-button";
import { activeTenantCount } from "@/services/tenants";

export const metadata = { title: "Dashboard" };

/** Kept deliberately simple: this month's RENT, and this month's EXPENSES one by one (electricity, water, gas cylinder). */
export default async function Dashboard() {
  const db = getDb();
  const month = currentMonth();
  const [split, byCat, active] = await Promise.all([rentVsExpenses(db, month), expenseByCategory(db, month), activeTenantCount(db)]);
  const cats = [["electricity", "Electricity"], ["water", "Water"], ["cooking_gas", "Gas cylinder"], ...(byCat.other.billed ? [["other", "Other"]] : [])] as const;
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={monthLabel(month)}
        actions={
          <>
            <AddTenantButton active={active} variant="secondary" />
            <Link href="/admin/payments/new" className={buttonClass("secondary")}><CreditCard className="size-4" aria-hidden /> Record payment</Link>
            <Link href="/admin/invoices" className={buttonClass()}><FilePlus2 className="size-4" aria-hidden /> Generate bills</Link>
          </>
        }
      />

      <section aria-labelledby="rent-h">
        <h2 id="rent-h" className="mb-2 text-sm font-semibold">Rent · {monthLabel(month)}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Rent billed" value={formatINR(split.rentBilled)} />
          <Stat label="Rent collected" value={formatINR(split.rentCollected)} tone="good" />
          <Stat label="Rent pending" value={formatINR(split.rentPending)} tone={split.rentPending ? "warn" : "good"} />
        </div>
      </section>

      <section aria-labelledby="exp-h" className="mt-6">
        <h2 id="exp-h" className="mb-2 text-sm font-semibold">Expenses · {monthLabel(month)}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
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
    </>
  );
}
