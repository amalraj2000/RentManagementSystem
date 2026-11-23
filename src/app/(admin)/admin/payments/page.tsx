import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { Badge, buttonClass, Empty, PageHeader, Pager, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { invoices, payments, tenantProfiles, users } from "@/db/schema";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PAGE_SIZE, pageParam } from "@/lib/page";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageParam((await searchParams).page);
  const rows = await getDb()
    .select({ id: payments.id, receiptNo: payments.receiptNo, amount: payments.amountPaise, paidOn: payments.paidOn, method: payments.method, reference: payments.reference, voidedAt: payments.voidedAt, name: users.name, month: invoices.periodMonth, invoiceId: invoices.id })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, payments.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .orderBy(desc(payments.paidOn), desc(payments.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;
  return (
    <>
      <PageHeader title="Payments" description="Manually recorded payments. Nothing here is verified by a payment gateway." actions={<Link href="/admin/payments/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Record payment</Link>} />
      {rows.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Tenant</Th><Th>For</Th><Th>Amount</Th><Th>Method</Th><Th>Receipt</Th></tr></thead>
          <tbody>
            {rows.slice(0, PAGE_SIZE).map((r) => (
              <tr key={r.id} className={r.voidedAt ? "text-muted" : ""}>
                <Td>{formatDate(r.paidOn)}</Td>
                <Td>{r.name}</Td>
                <Td><Link className="hover:underline" href={`/admin/invoices/${r.invoiceId}`}>{monthLabel(r.month)}</Link></Td>
                <Td className={`tabular-nums ${r.voidedAt ? "line-through" : ""}`}>{formatINR(r.amount)}</Td>
                <Td>{r.method.replace("_", " ")}{r.reference ? ` · ${r.reference}` : ""}</Td>
                <Td>{r.voidedAt ? <Badge kind="voided" /> : <Link className="hover:underline" href={`/receipt/${r.id}`}>{r.receiptNo}</Link>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} hasMore={hasMore} basePath="/admin/payments" />
    </>
  );
}
