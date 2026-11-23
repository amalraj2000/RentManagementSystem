import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { PaymentForm } from "@/components/payment-form";
import { Card, Empty, Field, PageHeader, Select } from "@/components/ui";
import { getDb } from "@/db/client";
import { invoices, tenantProfiles, users } from "@/db/schema";
import { monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export const metadata = { title: "Record payment" };

export default async function NewPayment({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const sp = await searchParams;
  const open = await getDb()
    .select({ id: invoices.id, name: users.name, month: invoices.periodMonth, balance: sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}` })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(sql`${invoices.totalPaise} > ${invoices.paidPaise}`)
    .orderBy(asc(users.name), asc(invoices.periodMonth));
  if (sp.invoice && open.some((o) => o.id === sp.invoice) === false) redirect("/admin/payments/new");
  const selected = open.find((o) => o.id === sp.invoice) ?? open[0];
  return (
    <>
      <PageHeader title="Record payment" />
      {!selected ? <Card><Empty>No open invoices. Generate invoices first.</Empty></Card> : (
        <Card className="max-w-2xl p-5">
          <form className="mb-4" method="get">
            <Field label="Invoice">
              <Select name="invoice" defaultValue={selected.id}>
                {open.map((o) => <option key={o.id} value={o.id}>{o.name} — {monthLabel(o.month)} — {formatINR(Number(o.balance))} due</option>)}
              </Select>
            </Field>
            <button className="mt-2 text-sm font-medium text-accent hover:underline">Select invoice</button>
          </form>
          <PaymentForm key={selected.id} invoiceId={selected.id} balance={Number(selected.balance)} />
        </Card>
      )}
    </>
  );
}
