import Link from "next/link";
import { Plus, CreditCard, FilePlus2 } from "lucide-react";
import { getDb } from "@/db/client";
import { buttonClass, PageHeader, Stat } from "@/components/ui";
import { currentMonth, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { monthBilling } from "@/services/reports";
import { AddTenantButton } from "@/components/add-tenant-button";
import { activeTenantCount } from "@/services/tenants";

export const metadata = { title: "Dashboard" };

/** Kept deliberately simple: this month's rent billed, collected and pending. */
export default async function Dashboard() {
  const db = getDb();
  const month = currentMonth();
  const [split, active] = await Promise.all([monthBilling(db, month), activeTenantCount(db)]);
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
          <Stat label="Rent billed" value={formatINR(split.billed)} />
          <Stat label="Rent collected" value={formatINR(split.collected)} tone="good" />
          <Stat label="Rent pending" value={formatINR(split.pending)} tone={split.pending ? "warn" : "good"} />
        </div>
      </section>
    </>
  );
}
