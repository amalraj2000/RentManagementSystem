import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { PaymentForm } from "@/components/payment-form";
import { BackLink } from "@/components/back-link";
import { Card, Empty, Field, Input, PageHeader, Select, Table, Td, Th, cn } from "@/components/ui";
import { collectDuesAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { invoices, tenantProfiles, users } from "@/db/schema";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { previewDues } from "@/services/collect";
import { purposeLabel, type Purpose } from "@/lib/billing";
import { openBills } from "@/services/billing";

export const metadata = { title: "Record payment" };

/** A real on/off switch rendered as a link (no JavaScript needed). */
function Toggle({ on, href, label, hint }: { on: boolean; href: string; label: string; hint: string }) {
  return (
    <Link href={href} role="switch" aria-checked={on} className="flex items-center gap-3 rounded-lg border border-line bg-white p-3 hover:bg-slate-50">
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-accent" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[1.375rem]" : "left-0.5")} />
      </span>
      <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
    </Link>
  );
}

export default async function NewPayment({ searchParams }: { searchParams: Promise<{ invoice?: string; mode?: string; tenant?: string; purpose?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const collectAll = sp.mode === "all";
  const purpose: Purpose = sp.purpose === "expense" ? "expense" : "rent";
  const dues = purposeLabel(purpose).toLowerCase();
  const toggle = <Toggle on={collectAll} href={collectAll ? "/admin/payments/new" : "/admin/payments/new?mode=all"} label="Collect all dues since check-in" hint="One entry settles rent (or expenses) for every month from the check-in date up to the last due date, oldest first." />;

  if (collectAll) {
    const tenants = await db
      .select({ id: tenantProfiles.id, name: users.name })
      .from(tenantProfiles)
      .innerJoin(users, eq(users.id, tenantProfiles.userId))
      .orderBy(asc(users.name));
    const selected = tenants.find((t) => t.id === sp.tenant) ?? null;
    const preview = selected ? await previewDues(db, selected.id, purpose) : null;
    return (
      <>
        <BackLink href="/admin/payments" label="Payments" />
        <PageHeader title="Record payment" />
        <div className="mb-4 max-w-2xl">{toggle}</div>
        <Card className="max-w-2xl p-5">
          <div className="mb-4 flex gap-1.5" role="tablist" aria-label="What to collect">
            {(["rent", "expense"] as const).map((p) => (
              <Link key={p} role="tab" aria-selected={purpose === p} href={`/admin/payments/new?mode=all&purpose=${p}${selected ? `&tenant=${selected.id}` : ""}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${purpose === p ? "bg-accent-soft text-accent" : "text-slate-600 hover:bg-slate-100"}`}>
                Collect {purposeLabel(p).toLowerCase()} dues
              </Link>
            ))}
          </div>
          <form method="get" className="mb-4">
            <input type="hidden" name="mode" value="all" />
            <input type="hidden" name="purpose" value={purpose} />
            <Field label="Tenant">
              <Select name="tenant" defaultValue={selected?.id ?? ""} required>
                <option value="" disabled>Select a tenant…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <button className="mt-2 text-sm font-medium text-accent hover:underline">Show dues</button>
          </form>
          {preview && selected && (
            preview.rows.length === 0 ? <Empty>No {dues} is due for {selected.name} up to the last due date.</Empty> : (
              <>
                <p className="mb-2 text-sm text-slate-700">
                  {purposeLabel(purpose)} dues for <strong>{selected.name}</strong> from check-in ({formatDate(preview.tenant.joiningDate)}) through <strong>{monthLabel(preview.lastDueMonth)}</strong>
                  {preview.toBill > 0 && <> — {preview.toBill} month{preview.toBill > 1 ? "s" : ""} without a bill will be billed first.</>}
                </p>
                <Table>
                  <thead><tr><Th>Month</Th><Th>Due date</Th><Th className="text-right">Due</Th></tr></thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.month}>
                        <Td>{monthLabel(r.month)}{r.willBill && <span className="ml-1.5 text-xs text-muted">(to be billed)</span>}</Td>
                        <Td>{r.dueDate ? formatDate(r.dueDate) : "—"}</Td>
                        <Td className="text-right tabular-nums">{formatINR(r.balance)}</Td>
                      </tr>
                    ))}
                    <tr><Td className="font-semibold">Total{preview.toBill > 0 ? " (estimate)" : ""}</Td><Td /><Td className="text-right font-semibold tabular-nums">{formatINR(preview.total)}</Td></tr>
                  </tbody>
                </Table>
                <ActionForm action={collectDuesAction.bind(null, selected.id)} submit={`Collect ${dues}`} redirectTo="/admin/payments" reset={false} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="purpose" value={purpose} />
                  <Field label="Amount received (₹)" hint={`Leave empty to collect everything (${formatINR(preview.total)}).`}><Input name="amount" inputMode="decimal" placeholder={`All dues · ${formatINR(preview.total)}`} /></Field>
                  <Field label="Payment date"><Input name="paidOn" type="date" required defaultValue={todayISO()} /></Field>
                  <Field label="Method">
                    <Select name="method" defaultValue="upi"><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></Select>
                  </Field>
                  <Field label="Reference no."><Input name="reference" maxLength={100} placeholder="UPI / UTR id" /></Field>
                  <Field label="Note" className="sm:col-span-2"><Input name="note" maxLength={200} /></Field>
                </ActionForm>
              </>
            )
          )}
        </Card>
      </>
    );
  }

  const open = await openBills(db);
  const bills = open.map((o) => ({ id: o.id, label: `${o.name} — ${monthLabel(o.month)}`, rentBalance: o.rentBalance, expenseBalance: o.expenseBalance }));
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/admin/payments" label="Payments" />
      <PageHeader title="Record payment" />
      {bills.length === 0 ? <Card><Empty>Nothing is due right now. Generate bills first.</Empty></Card> : (
        <Card className="p-5">
          <PaymentForm bills={bills} defaultBillId={sp.invoice} redirectTo="/admin/payments" />
        </Card>
      )}
      <div className="mt-4">{toggle}</div>
    </div>
  );
}
