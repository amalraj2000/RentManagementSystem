"use client";

import { cn } from "@/components/ui";

export type Choice = { value: string; label: string; hint?: string; disabled?: boolean };

/**
 * Tap-to-choose buttons (instead of a drop-down). Works as a plain form field: pass `defaultValue`,
 * or pass `value` + `onChange` to control it from the parent.
 */
export function ChoiceChips({ name, options, defaultValue, value, onChange, label }: { name: string; options: Choice[]; defaultValue?: string; value?: string; onChange?: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className={cn("cursor-pointer", o.disabled && "cursor-not-allowed opacity-45")}>
          <input
            type="radio"
            name={name}
            value={o.value}
            disabled={o.disabled}
            className="peer sr-only"
            {...(value !== undefined ? { checked: value === o.value, onChange: () => onChange?.(o.value) } : { defaultChecked: defaultValue === o.value })}
          />
          <span className="inline-flex min-h-10 flex-col items-center justify-center rounded-lg border border-line bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
            {o.label}
            {o.hint && <span className="text-[11px] font-normal text-muted">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export const METHOD_CHOICES: Choice[] = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
];
