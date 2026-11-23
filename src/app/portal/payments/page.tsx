import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { myPayments } from "@/services/portal";

export const metadata = { title: "Payments" };

export default async function PortalPayments() {
  const user = await requireTenant();
  const pays = await myPayments(getDb(), user.id);
  return (
    <>
      <PageHeader title="Payment history" />
      <Card>
        {pays.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
          <ul className="divide-y divide-line">
            {pays.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div><p className="font-medium tabular-nums">{formatINR(p.amountPaise)}</p><p className="text-xs text-muted">{formatDate(p.paidOn)} · {p.method.replace("_", " ")} · for {monthLabel(p.periodMonth)}</p></div>
                <Link href={`/receipt/${p.id}`} className="font-medium text-accent hover:underline">{p.receiptNo}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
