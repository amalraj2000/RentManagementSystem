import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { Brand } from "@/components/logo";
import { getDb } from "@/db/client";
import { invoices, payments, tenantProfiles, users } from "@/db/schema";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { methodLabel } from "@/lib/payment-methods";
import { requireUser } from "@/lib/session";
import { tenantForUser } from "@/services/portal";

export const metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";

export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const db = getDb();
  const [r] = await db
    .select({ p: payments, name: users.name, month: invoices.periodMonth, total: invoices.totalPaise, paid: invoices.paidPaise })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, payments.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(eq(payments.id, id));
  if (!r || r.p.voidedAt) notFound();
  // Authorisation: admins see all; tenants only receipts for their own profile (resolved from the session).
  if (user.role !== "admin") {
    const me = await tenantForUser(db, user.id);
    if (!me || me.id !== r.p.tenantId) notFound();
  }
  const left = r.total - r.paid;
  return (
    <main className="mx-auto max-w-md p-4 sm:p-8">
      <div className="rounded-xl border border-line bg-white p-6">
        <div className="flex items-start justify-between">
          <div><Brand className="mb-2 text-sm" markClassName="size-7" /><h1 className="text-lg font-semibold">Payment receipt</h1><p className="text-sm text-muted">{r.p.receiptNo}</p></div>
          <PrintButton />
        </div>
        <dl className="mt-5 space-y-2 text-sm">
          {[
            ["Received from", r.name],
            ["For", `Rent – ${monthLabel(r.month)}`],
            ["Date", formatDate(r.p.paidOn)],
            ["Method", methodLabel(r.p.method) + (r.p.reference ? ` (${r.p.reference})` : "")],
          ].map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right font-medium capitalize">{v}</dd></div>)}
        </dl>
        <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-sm text-muted">Amount received</span>
          <span className="text-2xl font-semibold tabular-nums">{formatINR(r.p.amountPaise)}</span>
        </div>
        <p className="mt-2 text-right text-xs text-muted">Still unpaid on this bill: {formatINR(Math.max(left, 0))}</p>
        <p className="mt-6 text-xs text-muted">Recorded manually by the PG owner. This is an acknowledgement of payment received.</p>
      </div>
    </main>
  );
}
