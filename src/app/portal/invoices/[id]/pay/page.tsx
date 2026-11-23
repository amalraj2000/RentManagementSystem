import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { FileInput } from "@/components/file-input";
import { ChoiceChips, METHOD_CHOICES } from "@/components/choice-chips";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { reportPaymentAction } from "@/actions/portal";
import { getDb } from "@/db/client";
import { categoryLabel } from "@/lib/categories";
import { monthLabel, todayISO } from "@/lib/dates";
import { formatINR, paiseToInput } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { claimsForInvoice } from "@/services/claims";
import { getInvoiceDetail, invoiceBuckets } from "@/services/billing";
import { mySharedItems, tenantForUser } from "@/services/portal";

export const metadata = { title: "Report a payment" };

/**
 * Rent and every expense are paid on their own:
 *   /pay            → this month's rent
 *   /pay?item=<id>  → ONE expense (electricity, water or gas cylinder), nothing else
 */
export default async function ReportPayment({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ amount?: string; for?: string; item?: string }> }) {
  const sp = await searchParams;
  const user = await requireTenant();
  const db = getDb();
  const me = await tenantForUser(db, user.id);
  if (!me) notFound();
  const { id } = await params;
  const inv = await getInvoiceDetail(db, id, me.id); // scoped to the logged-in tenant
  if (!inv) notFound();

  let title: string;
  let balance: number; // still unpaid for what we're paying
  let claimable: number; // minus what is already waiting for the owner to confirm
  let back: string;
  let itemId = "";
  if (sp.item || sp.for === "expense") {
    if (!sp.item) redirect("/portal/expenses"); // pick the expense first
    const line = (await mySharedItems(db, user.id)).find((i) => i.itemId === sp.item && i.invoiceId === id);
    if (!line) notFound();
    if (line.balance <= 0) redirect("/portal/expenses");
    title = categoryLabel(line.category);
    balance = line.balance;
    claimable = Math.max(line.balance - line.pending, 0);
    back = "/portal/expenses";
    itemId = line.itemId;
  } else {
    const waiting = (await claimsForInvoice(db, me.id, id)).filter((c) => c.status === "pending" && c.purpose === "rent").reduce((a, c) => a + c.amountPaise, 0);
    const b = await invoiceBuckets(db, id, undefined, { rent: waiting, expense: 0 });
    if (b.rentBalance <= 0) redirect("/portal/rent");
    title = "rent";
    balance = b.rentBalance;
    claimable = Math.max(b.rentBalance - b.pendingRent, 0);
    back = "/portal/rent";
  }
  const wanted = /^\d{1,9}$/.test(sp.amount ?? "") ? Number(sp.amount) : claimable;
  const prefillAmount = Math.min(Math.max(wanted, 1), claimable || 1);
  return (
    <div className="mx-auto max-w-md">
      <BackLink href={back} label={itemId ? "Expenses" : "Rent"} />
      <PageHeader title={`Pay ${title.toLowerCase() === "rent" ? "rent" : title}`} description={`${monthLabel(inv.periodMonth)} · ${formatINR(balance)} due`} />
      {claimable === 0 ? (
        <Card className="p-5 text-sm">You&apos;ve already told the owner about this payment. It will show as paid once they confirm.</Card>
      ) : (
        <Card className="p-5">
          <ActionForm action={reportPaymentAction.bind(null, id)} submit="I've paid" redirectTo={back} reset={false} className="space-y-5 [&>button]:h-12 [&>button]:w-full [&>button]:text-base">
            <input type="hidden" name="purpose" value={itemId ? "expense" : "rent"} />
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="paidOn" value={todayISO()} />
            <Field label="Amount (₹)">
              <Input name="amount" inputMode="decimal" required defaultValue={paiseToInput(prefillAmount)} className="h-12 text-lg font-semibold" />
            </Field>
            <div>
              <span className="mb-2 block text-sm font-medium">How did you pay?</span>
              <ChoiceChips name="method" label="How did you pay" options={METHOD_CHOICES} defaultValue="upi" />
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium">Screenshot <span className="font-normal text-muted">(optional)</span></span>
              <FileInput name="screenshot" accept="image/jpeg,image/png,image/webp" label="Payment screenshot" />
            </div>
          </ActionForm>
          <p className="mt-4 text-center text-xs text-muted">Pay the owner first, then tap the button. It shows as paid once they confirm.</p>
        </Card>
      )}
      {itemId && <p className="mt-4 text-center text-sm"><Link href="/portal/expenses" className="font-medium text-accent hover:underline">Pay a different expense</Link></p>}
    </div>
  );
}
