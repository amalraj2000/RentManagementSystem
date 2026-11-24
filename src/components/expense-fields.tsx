import { Field, Input, Textarea } from "@/components/ui";
import { paiseToInput } from "@/lib/money";
import { todayISO } from "@/lib/dates";

export function ExpenseFields({ e }: { e?: { title: string; note: string | null; amountPaise: number; expenseDate: string } }) {
  return (
    <div className="space-y-3">
      <Field label="Expense for"><Input name="title" required minLength={2} maxLength={120} placeholder="e.g. Gas cylinder" defaultValue={e?.title} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Total amount (₹)" hint="Split equally between the active tenants"><Input name="amount" inputMode="decimal" required defaultValue={e ? paiseToInput(e.amountPaise) : ""} /></Field>
        <Field label="Date"><Input name="expenseDate" type="date" required defaultValue={e?.expenseDate ?? todayISO()} /></Field>
      </div>
      <Field label="Note (optional)"><Textarea name="note" maxLength={500} defaultValue={e?.note ?? ""} /></Field>
    </div>
  );
}
