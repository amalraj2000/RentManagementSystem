"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { ChoiceChips, METHOD_CHOICES } from "@/components/choice-chips";
import { Field, Input, Select } from "@/components/ui";
import { recordPaymentAction } from "@/actions/admin";
import { paiseToInput } from "@/lib/money";
import { todayISO } from "@/lib/dates";

export type OpenBill = { id: string; label: string; balance: number };

/**
 * Record a payment, as simply as possible: which bill, how much, how it was paid.
 * Date, reference and note are optional and tucked under "More details".
 */
export function PaymentForm({ bills, defaultBillId, redirectTo }: { bills: OpenBill[]; defaultBillId?: string; redirectTo?: string }) {
  const first = bills.find((b) => b.id === defaultBillId) ?? bills[0];
  const [billId, setBillId] = useState(first?.id ?? "");
  const bill = bills.find((b) => b.id === billId) ?? first;
  if (!bill) return null;
  const balance = bill.balance;
  return (
    <ActionForm action={recordPaymentAction} submit="Record payment" redirectTo={redirectTo} reset={false} className="space-y-5 [&>button]:h-11 [&>button]:w-full">
      <input type="hidden" name="invoiceId" value={bill.id} />
      {bills.length > 1 && (
        <Field label="Who paid?">
          <Select
            value={bill.id}
            onChange={(e) => {
              const next = bills.find((b) => b.id === e.target.value)!;
              setBillId(next.id);
            }}
          >
            {bills.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Amount (₹)">
        <Input key={bill.id} name="amount" inputMode="decimal" required defaultValue={paiseToInput(balance)} className="h-12 text-lg font-semibold" />
      </Field>
      <div>
        <span className="mb-2 block text-sm font-medium">How was it paid?</span>
        <ChoiceChips name="method" label="How was it paid" options={METHOD_CHOICES} defaultValue="upi" />
      </div>
      <details className="group rounded-lg border border-line px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none font-medium text-slate-600 marker:text-slate-400">More details <span className="font-normal text-muted">(date, reference, note)</span></summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Payment date"><Input name="paidOn" type="date" required defaultValue={todayISO()} /></Field>
          <Field label="Reference no."><Input name="reference" maxLength={100} placeholder="UPI / UTR id" /></Field>
          <Field label="Note" className="sm:col-span-2"><Input name="note" maxLength={200} /></Field>
        </div>
      </details>
    </ActionForm>
  );
}
