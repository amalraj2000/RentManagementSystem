import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { PayFields } from "@/components/pay-fields";
import { Card, PageHeader } from "@/components/ui";
import { reportPaymentAction } from "@/actions/portal";
import { getDb } from "@/db/client";
import { monthLabel, todayISO } from "@/lib/dates";
import { formatINR, paiseToInput } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { claimsForInvoice } from "@/services/claims";
import { getInvoiceDetail, getSettings } from "@/services/billing";
import { tenantForUser } from "@/services/portal";

export const metadata = { title: "Report a payment" };

/** Tenant reports that they paid this month's bill (the owner confirms it). */
export default async function ReportPayment({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ amount?: string }> }) {
  const sp = await searchParams;
  const user = await requireTenant();
  const db = getDb();
  const me = await tenantForUser(db, user.id);
  if (!me) notFound();
  const { id } = await params;
  const inv = await getInvoiceDetail(db, id, me.id); // scoped to the logged-in tenant
  if (!inv) notFound();

  const waiting = (await claimsForInvoice(db, me.id, id)).filter((c) => c.status === "pending").reduce((a, c) => a + c.amountPaise, 0);
  const balance = Math.max(inv.totalPaise - inv.paidPaise, 0); // still unpaid
  if (balance <= 0) redirect("/portal/rent");
  const claimable = Math.max(balance - waiting, 0); // minus what is already waiting for the owner to confirm
  const back = "/portal/rent";
  const settings = await getSettings(db);
  const wanted = /^\d{1,9}$/.test(sp.amount ?? "") ? Number(sp.amount) : claimable;
  const prefillAmount = Math.min(Math.max(wanted, 1), claimable || 1);
  return (
    <div className="mx-auto max-w-md">
      <BackLink href={back} label="Rent" />
      <PageHeader title="Pay rent" description={`${monthLabel(inv.periodMonth)} · ${formatINR(balance)} due`} />
      {claimable === 0 ? (
        <Card className="p-5 text-sm">You&apos;ve already told the owner about this payment. It will show as paid once they confirm.</Card>
      ) : (
        <Card className="p-5">
          <ActionForm action={reportPaymentAction.bind(null, id)} submit="I've paid" redirectTo={back} reset={false} className="space-y-5 [&>button]:h-12 [&>button]:w-full [&>button]:text-base">
            <input type="hidden" name="paidOn" value={todayISO()} />
            <PayFields defaultAmount={paiseToInput(prefillAmount)} upiId={settings.upiId} payeeName={settings.upiPayeeName} note={`Rent ${monthLabel(inv.periodMonth)}`.slice(0, 60)} />
          </ActionForm>
          <p className="mt-4 text-center text-xs text-muted">It shows as paid once the owner confirms.</p>
        </Card>
      )}
    </div>
  );
}
