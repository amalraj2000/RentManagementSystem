import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { updatePaymentAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { payments } from "@/db/schema";
import { formatINR } from "@/lib/money";

export const metadata = { title: "Edit payment" };

export default async function EditPayment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p] = await getDb().select().from(payments).where(eq(payments.id, id));
  if (!p) notFound();
  if (p.voidedAt) redirect("/admin/payments");
  return (
    <>
      <BackLink href="/admin/payments" label="Rent" />
      <PageHeader title={`Edit payment · ${p.receiptNo}`} description={`${formatINR(p.amountPaise)}. The amount is locked to keep receipts accurate — to correct it, void this payment and record a new one.`} />
      <Card className="max-w-lg p-5">
        <ActionForm action={updatePaymentAction.bind(null, id)} redirectTo="/admin/payments" reset={false} className="space-y-3">
          <Field label="Payment date"><Input name="paidOn" type="date" required defaultValue={p.paidOn} /></Field>
          <Field label="Method">
            <Select name="method" defaultValue={p.method}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Reference no."><Input name="reference" maxLength={100} defaultValue={p.reference ?? ""} /></Field>
          <Field label="Note"><Input name="note" maxLength={200} defaultValue={p.note ?? ""} /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
