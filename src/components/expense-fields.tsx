import { FileInput } from "@/components/file-input";
import { Field, Input, Select } from "@/components/ui";
import { paiseToInput } from "@/lib/money";
import { CATEGORY_LABEL, EXPENSE_CATEGORIES } from "@/lib/categories";
import { todayISO } from "@/lib/dates";

export function ExpenseFields({ e, expenseId, receipt, tenants = [], shareMode = "none", shares = {} }: { tenants?: { id: string; name: string }[]; shareMode?: string; shares?: Record<string, number>; expenseId?: string; receipt?: { fileName: string; sizeBytes: number } | null; e?: { category: string; amountPaise: number; spentOn: string; description: string; receiptRef: string | null } }) {
  return (
    <div className="space-y-3">
      <Field label="Category">
        <Select name="category" defaultValue={e?.category ?? "cleaning"}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </Select>
      </Field>
      <Field label="Amount (₹)"><Input name="amount" inputMode="decimal" required defaultValue={e ? paiseToInput(e.amountPaise) : ""} /></Field>
      <Field label="Date"><Input name="spentOn" type="date" required defaultValue={e?.spentOn ?? todayISO()} /></Field>
      <Field label="Description"><Input name="description" required minLength={2} maxLength={200} defaultValue={e?.description} /></Field>
      <div className="rounded-lg border border-line bg-slate-50/60 p-3">
        <Field label="Share with tenants" hint="For electricity, water, cleaning etc. Shared amounts are added to each tenant's bill and appear on their dashboard.">
          <Select name="shareMode" defaultValue={shareMode}>
            <option value="none">Don&apos;t share — this is my own cost</option>
            <option value="equal">Split equally among active tenants ({tenants.length})</option>
            <option value="custom">Custom amount for each tenant</option>
          </Select>
        </Field>
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-xs font-medium text-muted">Custom amounts (₹) — only used for “Custom”. They can total less than the expense; you bear the rest.</legend>
          <div className="space-y-2">
            {tenants.length === 0 && <p className="text-xs text-muted">No active tenants for this month.</p>}
            {tenants.map((t) => (
              <label key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <Input name={`share_${t.id}`} inputMode="decimal" className="!w-28 shrink-0" aria-label={`Amount for ${t.name}`} defaultValue={shares[t.id] ? paiseToInput(shares[t.id]) : ""} />
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <Field label="Receipt reference (optional)"><Input name="receiptRef" maxLength={300} defaultValue={e?.receiptRef ?? ""} /></Field>
      <div>
        <span className="mb-1 block text-sm font-medium">Receipt image (optional)</span>
        {receipt && expenseId && (
          <div className="mb-2 flex items-center gap-3 rounded-lg border border-line p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image; Next image optimisation must not be used */}
            <a href={`/api/receipts/${expenseId}`} target="_blank" rel="noopener"><img src={`/api/receipts/${expenseId}`} alt="Current receipt" className="size-14 rounded object-cover" /></a>
            <div className="min-w-0 flex-1 text-xs"><p className="truncate font-medium">{receipt.fileName}</p><p className="text-muted">{Math.round(receipt.sizeBytes / 1024)} KB · choose a file below to replace it</p></div>
            <label className="flex items-center gap-1.5 text-xs text-red-700"><input type="checkbox" name="removeReceipt" className="size-4 accent-red-700" /> Remove</label>
          </div>
        )}
        <FileInput name="receipt" accept="image/jpeg,image/png,image/webp" label="Receipt image" />
        <p className="mt-1 text-xs text-muted">JPG, PNG or WebP up to 1.5 MB. Only admins can see it.</p>
      </div>
    </div>
  );
}
