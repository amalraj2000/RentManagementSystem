import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { PaymentForm } from "@/components/payment-form";
import { Badge, Card, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { addInvoiceItemAction, voidPaymentAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { getInvoiceDetail } from "@/services/billing";

export const metadata = { title: "Invoice" };

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const inv = await getInvoiceDetail(getDb(), (await params).id);
  if (!inv) notFound();
  const balance = Math.max(inv.totalPaise - inv.paidPaise, 0);
  return (
    <>
      <PageHeader
        title={`${inv.tenantName} · ${monthLabel(inv.periodMonth)}`}
        description={`Due ${formatDate(inv.dueDate)}`}
      />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted">Total</h2>
              <Badge kind={inv.totalPaise === 0 ? "unpaid" : balance <= 0 ? "paid" : inv.paidPaise > 0 ? "partial" : todayISO() > inv.dueDate ? "overdue" : "unpaid"} />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(inv.totalPaise)}</p>
            <p className="mt-1 text-xs text-muted">Paid {formatINR(inv.paidPaise)} · balance <span className="font-medium text-ink">{formatINR(balance)}</span></p>
          </Card>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Items</h2>
            <Table>
              <thead><tr><Th>Item</Th><Th className="text-right">Amount</Th></tr></thead>
              <tbody>
                {inv.items.map((i) => <tr key={i.id}><Td>{i.description}</Td><Td className="text-right tabular-nums">{formatINR(i.amountPaise)}</Td></tr>)}
                <tr><Td className="font-semibold">Total</Td><Td className="text-right font-semibold tabular-nums">{formatINR(inv.totalPaise)}</Td></tr>
                <tr><Td>Paid</Td><Td className="text-right tabular-nums">{formatINR(inv.paidPaise)}</Td></tr>
                <tr><Td className="font-semibold">Balance</Td><Td className="text-right font-semibold tabular-nums">{formatINR(balance)}</Td></tr>
              </tbody>
            </Table>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Payments</h2>
            <Table>
              <thead><tr><Th>Date</Th><Th>Amount</Th><Th>Method</Th><Th>Receipt</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {inv.payments.length === 0 && <tr><Td colSpan={5} className="text-center text-muted">No payments yet</Td></tr>}
                {inv.payments.map((p) => (
                  <tr key={p.id} className={p.voidedAt ? "text-muted line-through" : ""}>
                    <Td>{formatDate(p.paidOn)}</Td>
                    <Td className="tabular-nums">{formatINR(p.amountPaise)}</Td>
                    <Td>{p.method.replace("_", " ")}{p.reference ? ` · ${p.reference}` : ""}</Td>
                    <Td>{p.voidedAt ? <Badge kind="voided" /> : <Link className="hover:underline" href={`/receipt/${p.id}`}>{p.receiptNo}</Link>}</Td>
                    <Td>{!p.voidedAt && <ConfirmButton label="Void" title="Void this payment?" body="It stays in the audit trail but no longer counts as collected." withReason action={voidPaymentAction.bind(null, p.id)} confirmLabel="Void payment" />}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
        <div className="space-y-4">
          {balance > 0 && <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Record payment</h2><PaymentForm bills={[{ id: inv.id, label: inv.tenantName, balance }]} /></Card>}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Add charge or discount</h2>
            <ActionForm action={addInvoiceItemAction} submit="Add" className="space-y-3">
              <input type="hidden" name="invoiceId" value={inv.id} />
              <Field label="Type"><Select name="kind" defaultValue="adjustment"><option value="adjustment">Discount / adjustment (reduces total)</option><option value="other">Other charge (adds to total)</option></Select></Field>
              <Field label="Amount (₹)"><Input name="amount" inputMode="decimal" required /></Field>
              <Field label="Reason"><Input name="description" required minLength={3} maxLength={200} /></Field>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
