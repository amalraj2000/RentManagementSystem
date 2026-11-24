import { notFound } from "next/navigation";
import Link from "next/link";
import { BadgeIndianRupee, Undo2 } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { ChoiceChips, METHOD_CHOICES } from "@/components/choice-chips";
import { Badge, buttonClass, Card, PageHeader, RowActions, Table, Td, Th } from "@/components/ui";
import { markSharePaidAction, revertShareAction } from "@/actions/expenses";
import { getDb } from "@/db/client";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { methodLabel } from "@/lib/payment-methods";
import { requireAdmin } from "@/lib/session";
import { expenseDetail } from "@/services/expenses";

export const metadata = { title: "Expense" };

export default async function ExpenseView({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const d = await expenseDetail(getDb(), id);
  if (!d) notFound();
  const { exp, shares } = d;
  const paid = shares.filter((s) => s.status === "paid");
  const collected = paid.reduce((a, s) => a + s.amountPaise, 0);
  return (
    <>
      <BackLink href="/admin/expenses" label="Expenses" />
      <PageHeader
        title={exp.title}
        description={`${formatDate(exp.expenseDate)} · ${formatINR(exp.amountPaise)} in total · ${paid.length} of ${shares.length} paid (${formatINR(collected)})`}
        actions={<Link href={`/admin/expenses/${id}/edit`} className={buttonClass("secondary")}>Edit</Link>}
      />
      {exp.note && <Card className="mb-4 p-4 text-sm text-slate-700">{exp.note}</Card>}
      <Table>
        <thead><tr><Th>Tenant</Th><Th className="text-right">Share</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
        <tbody>
          {shares.map((s) => (
            <tr key={s.id}>
              <Td><Link className="font-medium hover:underline" href={`/admin/tenants/${s.tenantId}`}>{s.name}</Link></Td>
              <Td className="text-right tabular-nums">{formatINR(s.amountPaise)}</Td>
              <Td>
                <Badge kind={s.status === "paid" ? "paid" : s.status === "waiting" ? "waiting" : "due"} />
                {s.status !== "due" && s.paidOn && <span className="mt-0.5 block text-xs text-muted">{formatDate(s.paidOn)}{s.method ? ` · ${methodLabel(s.method)}` : ""}</span>}
              </Td>
              <Td>
                <RowActions>
                  {s.status === "waiting" && (
                    <>
                      <ConfirmButton label="Approve" variant="primary" title={`Confirm ${s.name}'s payment?`} body={`${formatINR(s.amountPaise)} reported as paid${s.method ? ` by ${methodLabel(s.method)}` : ""}. Only confirm once you've received the money.`} confirmLabel="Confirm payment" action={markSharePaidAction.bind(null, s.id)} />
                      <ConfirmButton label="Reject" title="Reject this report?" body="It goes back to due." confirmLabel="Reject" action={revertShareAction.bind(null, s.id)} />
                    </>
                  )}
                  {s.status === "due" && (
                    <ConfirmButton
                      label="Mark paid"
                      variant="primary"
                      icon={<BadgeIndianRupee className="size-4" aria-hidden />}
                      title={`Mark ${s.name}'s share as paid?`}
                      body={`${formatINR(s.amountPaise)} is recorded as paid in full, today.`}
                      confirmLabel="Mark paid"
                      extra={<div className="mt-3"><ChoiceChips name="method" label="Paid by" options={METHOD_CHOICES} defaultValue="cash" /></div>}
                      action={markSharePaidAction.bind(null, s.id)}
                    />
                  )}
                  {s.status === "paid" && <ConfirmButton label="Revert" variant="secondary" icon={<Undo2 className="size-4" aria-hidden />} title={`Take back ${s.name}'s payment?`} body="It goes back to due." confirmLabel="Revert" action={revertShareAction.bind(null, s.id)} />}
                </RowActions>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
