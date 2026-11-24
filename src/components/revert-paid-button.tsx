import { Undo2 } from "lucide-react";
import { revertPaymentsAction } from "@/actions/admin";
import { ConfirmButton } from "@/components/action-form";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { methodLabel } from "@/lib/payment-methods";

export type PaidRow = { id: string; what: string; amount: number; paidOn: string; method: string };

/** "Revert": lists what was paid so a payment marked by mistake can be taken back. */
export function RevertPaidButton({ name, rows, iconOnly }: { name: string; rows: PaidRow[]; iconOnly?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <ConfirmButton
      label="Revert"
      variant="secondary"
      icon={iconOnly ? <Undo2 className="size-4" aria-hidden /> : undefined}
      title={`Revert ${name}'s payments?`}
      body="Tick what to take back. It stops counting as paid but stays in the records."
      confirmLabel="Revert"
      action={revertPaymentsAction}
      extra={
        <div className="mt-3">
          <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {rows.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <input type="checkbox" name="pay" value={r.id} className="size-4 shrink-0 accent-teal-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{r.what}</span>
                    <span className="block text-xs text-muted">{formatDate(r.paidOn)} · {methodLabel(r.method)}</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums">{formatINR(r.amount)}</span>
                </label>
              </li>
            ))}
          </ul>
          <input name="reason" maxLength={200} placeholder="Reason (optional)" aria-label="Reason" className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
      }
    />
  );
}
