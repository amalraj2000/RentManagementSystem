import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { invoiceStatus } from "@/lib/billing";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { myInvoices } from "@/services/portal";

export const metadata = { title: "Invoices" };

export default async function PortalInvoices() {
  const user = await requireTenant();
  const invs = await myInvoices(getDb(), user.id, 36);
  const today = todayISO();
  return (
    <>
      <PageHeader title="Invoices" />
      {invs.length === 0 ? <Card><Empty>No invoices yet.</Empty></Card> : (
        <ul className="space-y-2">
          {invs.map((i) => (
            <li key={i.id}>
              <Link href={`/portal/invoices/${i.id}`} className="flex items-center justify-between rounded-xl border border-line bg-white p-4 hover:border-accent">
                <div><p className="font-medium">{monthLabel(i.periodMonth)}</p><p className="text-xs text-muted">Due {formatDate(i.dueDate)} · Total {formatINR(i.totalPaise)}</p></div>
                <Badge kind={invoiceStatus(i, today)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
