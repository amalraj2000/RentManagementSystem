import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Inbox, Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { Badge, buttonClass, EditLink, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { voidPaymentAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { invoices, payments, tenantProfiles, users } from "@/db/schema";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { offsetFor, PAGE_SIZE, pageParam } from "@/lib/page";
import { pendingClaimCount } from "@/services/claims";

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
    .limit(PAGE_SIZE)
    .offset(offsetFor(page));
  const [{ n: total }] = await getDb().select({ n: sql<number>`count(*)` }).from(payments);
  const waiting = await pendingClaimCount(getDb());
  return (
    <>
      <PageHeader title="Payments" description="Manually recorded payments — nothing here is verified by a payment gateway. Payments are voided, never deleted." actions={<><Link href="/admin/payments/claims" className={buttonClass("secondary")}><Inbox className="size-4" aria-hidden /> Reported by tenants{waiting > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">{waiting}</span>}</Link><Link href="/admin/payments/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Record payment</Link></>} />
      {rows.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Tenant</Th><Th>For</Th><Th className="text-right">Amount</Th><Th>Method</Th><Th>Receipt</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {rows.slice(0, PAGE_SIZE).map((r) => (
              <tr key={r.id} className={r.voidedAt ? "text-muted" : ""}>
                <Td>{formatDate(r.paidOn)}</Td>
                <Td>{r.name}</Td>
                <Td><Link className="hover:underline" href={`/admin/invoices/${r.invoiceId}`}>{monthLabel(r.month)}</Link></Td>
                <Td className={`text-right tabular-nums ${r.voidedAt ? "line-through" : ""}`}>{formatINR(r.amount)}</Td>
                <Td>{r.method.replace("_", " ")}{r.reference ? ` · ${r.reference}` : ""}</Td>
                <Td>{r.voidedAt ? "—" : <Link className="hover:underline" href={`/receipt/${r.id}`}>{r.receiptNo}</Link>}</Td>
                <Td><Badge kind={r.voidedAt ? "voided" : "paid"} /></Td>
                <Td>
                  {!r.voidedAt && (
                    <RowActions>
                      <EditLink href={`/admin/payments/${r.id}/edit`} />
                      <ConfirmButton label="Void" title="Void this payment?" body="It stays in the audit trail but no longer counts as collected." withReason action={voidPaymentAction.bind(null, r.id)} confirmLabel="Void payment" />
                    </RowActions>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={Number(total)} basePath="/admin/payments" />
    </>
  );
}
