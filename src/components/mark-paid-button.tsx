import { BadgeIndianRupee } from "lucide-react";
import { markPaidManyAction } from "@/actions/admin";
import { ConfirmButton } from "@/components/action-form";
import { ChoiceChips, METHOD_CHOICES } from "@/components/choice-chips";
import { monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export type UnpaidItem = { key: string; label: string; amount: number; month: string; kind: "rent" | "expense" };

/**
 * "Mark paid" for one tenant: opens a small box listing everything still unpaid (rent and each expense on its own, oldest first),
 * all ticked. Untick what was not paid, choose UPI or Cash, confirm. Shows nothing when the tenant owes nothing.
 */
export function MarkPaidButton({ name, items, iconOnly }: { name: string; items: UnpaidItem[]; /** Compact icon button (for table rows). */ iconOnly?: boolean }) {
  if (items.length === 0) return null;
  return (
    <ConfirmButton
      label="Mark paid"
      icon={iconOnly ? <BadgeIndianRupee className="size-4" aria-hidden /> : undefined}
      variant="primary"
      title={`Mark ${name}'s payment as received?`}
      body="Tick what they have paid. Each one is marked as paid in full, today."
      confirmLabel="Mark paid"
      action={markPaidManyAction}
      extra={
        <div className="mt-3">
          <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {items.map((i) => (
              <li key={i.key}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <input type="checkbox" name="pick" value={i.key} defaultChecked className="size-4 shrink-0 accent-teal-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{i.label}</span>
                    <span className="block text-xs text-muted">{monthLabel(i.month)}</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums">{formatINR(i.amount)}</span>
                </label>
              </li>
            ))}
          </ul>
          <span className="mb-1.5 mt-3 block text-sm font-medium">How was it paid?</span>
          <ChoiceChips name="method" label="How was it paid" options={METHOD_CHOICES} defaultValue="upi" />
        </div>
      }
    />
  );
}
