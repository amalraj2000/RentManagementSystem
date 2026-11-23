import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { recordPaymentAction } from "@/actions/admin";
import { paiseToInput } from "@/lib/money";
import { todayISO } from "@/lib/dates";

export function PaymentForm({ invoiceId, balance }: { invoiceId: string; balance: number }) {
  return (
    <ActionForm action={recordPaymentAction} submit="Record payment" className="grid gap-3 sm:grid-cols-2" reset={false}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field label="Amount (₹)" hint="Full or partial. Cannot exceed the balance."><Input name="amount" inputMode="decimal" required defaultValue={paiseToInput(balance)} /></Field>
      <Field label="Payment date"><Input name="paidOn" type="date" required defaultValue={todayISO()} /></Field>
      <Field label="Method">
        <Select name="method" defaultValue="upi">
          <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Reference no."><Input name="reference" maxLength={100} placeholder="UPI / UTR id" /></Field>
      <Field label="Note" className="sm:col-span-2"><Input name="note" maxLength={200} /></Field>
    </ActionForm>
  );
}
