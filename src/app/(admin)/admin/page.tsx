import Link from "next/link";
import { Plus, CreditCard, FilePlus2 } from "lucide-react";
import { getDb } from "@/db/client";
import { Badge, buttonClass, Card, PageHeader, Stat } from "@/components/ui";
import { currentMonth, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { expenseByCategory, rentVsExpenses } from "@/services/reports";
import { AddTenantButton } from "@/components/add-tenant-button";
import { activeTenantCount } from "@/services/tenants";
import { pendingClaimCount } from "@/services/claims";

export const metadata = { title: "Dashboard" };

/** Kept deliberately simple: this month's RENT, and this month's EXPENSES one by one (electricity, water, gas cylinder). */
export default async function Dashboard() {
  const db = getDb();
  const month = currentMonth();
  const [split, byCat, active, waiting] = await Promise.all([rentVsExpenses(db, month), expenseByCategory(db, month), activeTenantCount(db), pendingClaimCount(db)]);
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

      {/* the Payments menu is gone, so payment reports from tenants are pointed out here */}
      {waiting > 0 && (
        <Link href="/admin/payments?show=waiting" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <span><strong>{waiting}</strong> payment report{waiting > 1 ? "s" : ""} from tenants waiting for you to confirm</span>
          <span className="font-medium underline">Review</span>
        </Link>
      )}
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
