import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { invoiceStatus } from "@/lib/billing";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { getInvoiceDetail } from "@/services/billing";
import { tenantForUser } from "@/services/portal";
import { claimsForInvoice } from "@/services/claims";
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
  const balance = Math.max(inv.totalPaise - inv.paidPaise, 0);
  const valid = inv.payments.filter((p) => !p.voidedAt);
  const claims = (await claimsForInvoice(db, me.id, inv.id)).filter((c) => c.status === "pending");
  const waiting = claims.reduce((a, c) => a + c.amountPaise, 0);
  return (
    <>
      <BackLink href="/portal/rent" label="Rent" />
      <PageHeader title={monthLabel(inv.periodMonth)} description={`Due ${formatDate(inv.dueDate)}`} actions={<Badge kind={invoiceStatus(inv, todayISO())} />} />
      <Table>
        <thead><tr><Th>Item</Th><Th className="text-right">Amount</Th></tr></thead>
        <tbody>
          {inv.items.map((i) => <tr key={i.id}><Td>{i.description}</Td><Td className="text-right tabular-nums">{formatINR(i.amountPaise)}</Td></tr>)}
          <tr><Td className="font-semibold">Total</Td><Td className="text-right font-semibold tabular-nums">{formatINR(inv.totalPaise)}</Td></tr>
          <tr><Td>Paid</Td><Td className="text-right tabular-nums">{formatINR(inv.paidPaise)}</Td></tr>
          <tr><Td className="font-semibold">Remaining</Td><Td className="text-right font-semibold tabular-nums">{formatINR(balance)}</Td></tr>
        </tbody>
      </Table>
      {balance > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white p-4">
          <p className="text-sm text-slate-700">{waiting > 0 ? <span className="font-medium text-amber-700">{formatINR(waiting)} reported — waiting for the owner to confirm</span> : "Already paid this?"}</p>
          {balance - waiting > 0 && <Link href={`/portal/invoices/${inv.id}/pay`} className={buttonClass()}>I&apos;ve paid</Link>}
        </div>
      )}
      <h2 className="mb-2 mt-6 text-sm font-semibold">Payments</h2>
      <Card>
        {valid.length === 0 ? <p className="p-4 text-sm text-muted">No payments recorded yet.</p> : (
          <ul className="divide-y divide-line">
            {valid.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div><p className="font-medium tabular-nums">{formatINR(p.amountPaise)}</p><p className="text-xs text-muted">{formatDate(p.paidOn)} · {p.method.replace("_", " ")}</p></div>
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
