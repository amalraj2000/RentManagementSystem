import { formatINR } from "@/lib/money";

/** Rent and expenses are never added together: each amount is shown on its own line. */
export function SplitAmount({ rent, expense }: { rent: number; expense: number }) {
  return (
    <div className="shrink-0 text-right text-sm tabular-nums">
      {rent > 0 && <p><span className="mr-1.5 text-xs text-muted">Rent</span><span className="font-medium">{formatINR(rent)}</span></p>}
      {expense > 0 && <p><span className="mr-1.5 text-xs text-muted">Expenses</span><span className="font-medium">{formatINR(expense)}</span></p>}
    </div>
  );
}
