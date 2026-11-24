import { BadgeIndianRupee } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { ChoiceChips, METHOD_CHOICES } from "@/components/choice-chips";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { reportExpensePaidAction } from "@/actions/expenses";
import { getDb } from "@/db/client";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { myExpenseShares } from "@/services/expenses";

export const metadata = { title: "Expenses" };

export default async function PortalExpenses() {
  const user = await requireTenant();
  const list = await myExpenseShares(getDb(), user.id);
  const due = list.filter((s) => s.status === "due").reduce((a, s) => a + s.amountPaise, 0);
  return (
    <>
      <PageHeader title="Expenses" description={due > 0 ? `Your share still due: ${formatINR(due)}. Shared costs are separate from rent.` : "Shared costs are separate from rent."} />
      {list.length === 0 ? <Card><Empty>No expenses yet.</Empty></Card> : (
        <div className="space-y-3">
          {list.map((s) => (
            <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted">{formatDate(s.date)} · total {formatINR(s.totalPaise)}{s.note ? ` · ${s.note}` : ""}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-medium tabular-nums">{formatINR(s.amountPaise)}</p>
                  <Badge kind={s.status === "paid" ? "paid" : s.status === "waiting" ? "waiting" : "due"} />
                </div>
                {s.status === "due" && (
                  <ConfirmButton
                    label="I've paid"
                    variant="primary"
                    icon={<BadgeIndianRupee className="size-4" aria-hidden />}
                    title="Tell the owner you paid?"
                    body={`Your share is ${formatINR(s.amountPaise)}. The owner will confirm once they receive it.`}
                    confirmLabel="Send"
                    extra={<div className="mt-3"><ChoiceChips name="method" label="Paid by" options={METHOD_CHOICES} defaultValue="upi" /></div>}
                    action={reportExpensePaidAction.bind(null, s.id)}
                  />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
