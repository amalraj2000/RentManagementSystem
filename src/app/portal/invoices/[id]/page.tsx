import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { invoiceStatus } from "@/lib/billing";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { getInvoiceDetail, invoiceBuckets } from "@/services/billing";
import { tenantForUser } from "@/services/portal";
import { claimsForInvoice } from "@/services/claims";
import { purposeLabel, rentState, type Purpose } from "@/lib/billing";
import { methodLabel } from "@/lib/payment-methods";
import { buttonClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";

export const metadata = { title: "Invoice" };

export default async function PortalInvoice({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireTenant();
  const db = getDb();
  const me = await tenantForUser(db, user.id);
  if (!me) notFound();
  // Scoped by the session-derived tenant id: another tenant's invoice id resolves to 404.
  const inv = await getInvoiceDetail(db, (await params).id, me.id);
  if (!inv) notFound();
  const valid = inv.payments.filter((p) => !p.voidedAt);
  const waiting = (await claimsForInvoice(db, me.id, inv.id)).filter((c) => c.status === "pending");
  const pendingOf = (p: Purpose) => waiting.filter((c) => c.purpose === p).reduce((a, c) => a + c.amountPaise, 0);
  const b = await invoiceBuckets(db, inv.id, undefined, { rent: pendingOf("rent"), expense: pendingOf("expense") });
  const sections = [
    { purpose: "rent" as const, name: "Rent", payable: b.rentPayable, paid: b.rentCovered, balance: b.rentBalance, pending: b.pendingRent },
    { purpose: "expense" as const, name: "Expenses", payable: b.expensePayable, paid: b.expenseCovered, balance: b.expenseBalance, pending: b.pendingExpense },
  ].filter((x) => x.payable > 0);
  return (
    <>
      <BackLink href="/portal/rent" label="Rent" />
      <PageHeader title={monthLabel(inv.periodMonth)} description={`Due ${formatDate(inv.dueDate)}`} />
      <div className={`grid gap-3 ${sections.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {sections.map((x) => (
          <Card key={x.purpose} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted">{x.name}</h2>
              <Badge kind={rentState({ totalPaise: x.payable, paidPaise: x.paid, dueDate: inv.dueDate }, x.pending, todayISO())} wrap />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(x.payable)}</p>
            <p className="mt-1 flex-1 text-xs text-muted">Paid {formatINR(x.paid)} · remaining <span className="font-medium text-ink">{formatINR(x.balance)}</span></p>
            {x.balance - x.pending > 0 && <Link href={x.purpose === "rent" ? `/portal/invoices/${inv.id}/pay?for=rent` : "/portal/expenses"} className={`${buttonClass()} mt-3 w-full`}>{x.purpose === "rent" ? "Pay rent" : "Pay an expense"}</Link>}
          </Card>
        ))}
      </div>
      {([["Rent", inv.items.filter((i) => i.kind === "rent" || i.kind === "adjustment")], ["Expenses", inv.items.filter((i) => i.kind !== "rent" && i.kind !== "adjustment")]] as const).filter(([, items]) => items.length > 0).map(([name, items]) => (
        <div key={name}>
          <h2 className="mb-2 mt-6 text-sm font-semibold">{name} · what it is made of</h2>
          <Table compact>
            <thead><tr><Th>Item</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {items.map((i) => <tr key={i.id}><Td className="whitespace-normal">{i.description}</Td><Td className="text-right tabular-nums">{formatINR(i.amountPaise)}</Td></tr>)}
            </tbody>
          </Table>
        </div>
      ))}
      <h2 className="mb-2 mt-6 text-sm font-semibold">Payments</h2>
      <Card>
        {valid.length === 0 ? <p className="p-4 text-sm text-muted">No payments recorded yet.</p> : (
          <ul className="divide-y divide-line">
            {valid.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div><p className="font-medium tabular-nums">{formatINR(p.amountPaise)}</p><p className="text-xs text-muted">{purposeLabel(p.purpose)} · {formatDate(p.paidOn)} · {methodLabel(p.method)}</p></div>
                <Link href={`/receipt/${p.id}`} className="font-medium text-accent hover:underline">Receipt</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted">Payments are recorded by the PG owner after they receive them. Pay the owner directly and ask for it to be recorded.</p>
    </>
  );
}
