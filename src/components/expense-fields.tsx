import { Field, Input, Select, Textarea } from "@/components/ui";
import { EXPENSE_TYPES } from "@/lib/expense-types";
import { paiseToInput } from "@/lib/money";
import { todayISO } from "@/lib/dates";

export function ExpenseFields({ e }: { e?: { title: string; note: string | null; amountPaise: number; expenseDate: string } }) {
  return (
    <div className="space-y-3">
      <Field label="Expense for">
        <Select name="title" required defaultValue={e?.title ?? EXPENSE_TYPES[0]}>
          {e && !(EXPENSE_TYPES as readonly string[]).includes(e.title) && <option value={e.title}>{e.title}</option>}
          {EXPENSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Total amount (₹)" hint="Split equally between the active tenants"><Input name="amount" inputMode="decimal" required defaultValue={e ? paiseToInput(e.amountPaise) : ""} /></Field>
        <Field label="Date"><Input name="expenseDate" type="date" required defaultValue={e?.expenseDate ?? todayISO()} /></Field>
      </div>
      <Field label="Note (optional)"><Textarea name="note" maxLength={500} defaultValue={e?.note ?? ""} /></Field>
    </div>
  );
}
