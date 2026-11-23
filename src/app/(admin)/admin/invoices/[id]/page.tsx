import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { PaymentForm } from "@/components/payment-form";
import { Badge, Card, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { addInvoiceItemAction, voidPaymentAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { getInvoiceDetail, invoiceBuckets } from "@/services/billing";
import { purposeLabel } from "@/lib/billing";

export const metadata = { title: "Invoice" };

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const inv = await getInvoiceDetail(getDb(), (await params).id);
  if (!inv) notFound();
  const b = await invoiceBuckets(getDb(), inv.id);
  return (
    <>
      <PageHeader
        title={`${inv.tenantName} · ${monthLabel(inv.periodMonth)}`}
        description={`Due ${formatDate(inv.dueDate)}`}
      />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {([["Rent", b.rentPayable, b.rentCovered, b.rentBalance], ["Expenses", b.expensePayable, b.expenseCovered, b.expenseBalance]] as const).map(([name, payable, paid, bal]) => (
              <Card key={name} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold text-muted">{name}</h2>
                  <Badge kind={payable === 0 ? "unpaid" : bal <= 0 ? "paid" : paid > 0 ? "partial" : todayISO() > inv.dueDate ? "overdue" : "unpaid"} />
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(payable)}</p>
                <p className="mt-1 text-xs text-muted">Paid {formatINR(paid)} · balance <span className="font-medium text-ink">{formatINR(bal)}</span></p>
              </Card>
            ))}
          </div>
          {/* rent and expenses are listed and added up separately — never one combined total */}
          {([
            ["Rent", inv.items.filter((i) => i.kind === "rent" || i.kind === "adjustment"), b.rentPayable, b.rentCovered, b.rentBalance],
            ["Expenses", inv.items.filter((i) => i.kind !== "rent" && i.kind !== "adjustment"), b.expensePayable, b.expenseCovered, b.expenseBalance],
          ] as const).filter(([, items]) => items.length > 0).map(([name, items, payable, paid, bal]) => (
            <div key={name}>
              <h2 className="mb-2 text-sm font-semibold">{name}</h2>
              <Table>
                <thead><tr><Th>Item</Th><Th className="text-right">Amount</Th></tr></thead>
                <tbody>
                  {items.map((i) => <tr key={i.id}><Td>{i.description}</Td><Td className="text-right tabular-nums">{formatINR(i.amountPaise)}</Td></tr>)}
                  <tr><Td className="font-semibold">{name} total</Td><Td className="text-right font-semibold tabular-nums">{formatINR(payable)}</Td></tr>
                  <tr><Td>Paid</Td><Td className="text-right tabular-nums">{formatINR(paid)}</Td></tr>
                  <tr><Td className="font-semibold">Balance</Td><Td className="text-right font-semibold tabular-nums">{formatINR(bal)}</Td></tr>
                </tbody>
              </Table>
            </div>
          ))}
          <div>
            <h2 className="mb-2 text-sm font-semibold">Payments</h2>
            <Table>
              <thead><tr><Th>Date</Th><Th>For</Th><Th>Amount</Th><Th>Method</Th><Th>Receipt</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {inv.payments.length === 0 && <tr><Td colSpan={6} className="text-center text-muted">No payments yet</Td></tr>}
                {inv.payments.map((p) => (
                  <tr key={p.id} className={p.voidedAt ? "text-muted line-through" : ""}>
                    <Td>{formatDate(p.paidOn)}</Td>
                    <Td>{purposeLabel(p.purpose)}</Td>
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
          {(b.rentBalance > 0 || b.expenseBalance > 0) && <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Record payment</h2><PaymentForm bills={[{ id: inv.id, label: inv.tenantName, rentBalance: b.rentBalance, expenseBalance: b.expenseBalance }]} /></Card>}
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
