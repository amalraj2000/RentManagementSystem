import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { FileInput } from "@/components/file-input";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { reportPaymentAction } from "@/actions/portal";
import { getDb } from "@/db/client";
import { balanceOf } from "@/lib/billing";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR, paiseToInput } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { claimsForInvoice } from "@/services/claims";
import { getInvoiceDetail } from "@/services/billing";
import { tenantForUser } from "@/services/portal";

export const metadata = { title: "Report a payment" };

export default async function ReportPayment({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ amount?: string; note?: string }> }) {
  const sp = await searchParams;
  const user = await requireTenant();
  const db = getDb();
  const me = await tenantForUser(db, user.id);
  if (!me) notFound();
  const { id } = await params;
  const inv = await getInvoiceDetail(db, id, me.id); // scoped to the logged-in tenant
  if (!inv) notFound();
  const balance = balanceOf(inv);
  if (balance <= 0) redirect(`/portal/invoices/${id}`);
  const pending = (await claimsForInvoice(db, me.id, id)).filter((c) => c.status === "pending").reduce((a, c) => a + c.amountPaise, 0);
  const claimable = Math.max(balance - pending, 0);
  const wanted = /^\d{1,9}$/.test(sp.amount ?? "") ? Number(sp.amount) : claimable;
  const prefillAmount = Math.min(Math.max(wanted, 1), claimable || 1);
  const prefillNote = (sp.note ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, 100);
  return (
    <>
      <BackLink href="/portal" label="Home" />
      <PageHeader title="I've paid" description={`${monthLabel(inv.periodMonth)} bill · balance ${formatINR(balance)} · due ${formatDate(inv.dueDate)}`} />
      {claimable === 0 ? (
        <Card className="p-5 text-sm">Your earlier report already covers the whole balance and is waiting for the owner to confirm it.</Card>
      ) : (
        <Card className="max-w-lg p-5">
          <p className="mb-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Pay the owner first (UPI, bank transfer or cash), then tell us here. Your bill is updated <strong>after the owner confirms</strong> they received it — for online payments, attach a screenshot to speed that up.
          </p>
          <ActionForm action={reportPaymentAction.bind(null, id)} submit="Send to owner" redirectTo="/portal/rent" reset={false} className="space-y-3">
            <Field label="Amount you paid (₹)" hint={pending ? `Up to ${formatINR(claimable)} (other reports are waiting for confirmation)` : `Up to ${formatINR(claimable)}`}>
              <Input name="amount" inputMode="decimal" required defaultValue={paiseToInput(prefillAmount)} />
            </Field>
            <Field label="Payment date"><Input name="paidOn" type="date" required max={todayISO()} defaultValue={todayISO()} /></Field>
            <Field label="How did you pay?">
              <Select name="method" defaultValue="upi"><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="other">Other</option></Select>
            </Field>
            <Field label="Transaction / reference no. (optional)"><Input name="reference" maxLength={100} placeholder="UPI ref / UTR" /></Field>
            <div>
              <span className="mb-1 block text-sm font-medium">Payment screenshot (optional)</span>
              <FileInput name="screenshot" accept="image/jpeg,image/png,image/webp" label="Payment screenshot" />
              <p className="mt-1 text-xs text-muted">JPG, PNG or WebP. Only you and the owner can see it.</p>
            </div>
            <Field label="Note (optional)"><Input name="note" maxLength={200} defaultValue={prefillNote} /></Field>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
