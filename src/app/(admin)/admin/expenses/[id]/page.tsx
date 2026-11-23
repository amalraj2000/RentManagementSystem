import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { BackLink } from "@/components/back-link";
import { Badge, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { expenseReceipts, expenses } from "@/db/schema";
import { categoryLabel } from "@/lib/categories";
import { formatDate, monthLabelShort } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { expenseStatuses } from "@/services/expense-status";

export const metadata = { title: "Expense" };

/** One expense: whether it is still Active or Completed, and which tenants have paid their share and which have not. */
export default async function ExpenseView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [e] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!e) notFound();
  const [receipt] = await db.select({ id: expenseReceipts.id }).from(expenseReceipts).where(eq(expenseReceipts.expenseId, id));
  const s = (await expenseStatuses(db, [{ id: e.id, utilityBillId: e.utilityBillId }])).get(e.id)!;
  const unpaid = s.rows.filter((r) => r.state !== "paid");
  const owed = unpaid.reduce((a, r) => a + r.balance, 0);
  const got = s.rows.reduce((a, r) => a + r.paid, 0);
  return (
    <>
      <BackLink href="/admin/expenses" label="Expenses" />
      <PageHeader
        title={`${categoryLabel(e.category)} · ${formatINR(e.amountPaise)}`}
        description={formatDate(e.spentOn)}
        actions={s.state !== "none" ? <Badge kind={s.state} /> : undefined}
      />
      {(e.description && e.description !== categoryLabel(e.category)) || e.receiptRef || receipt ? (
        <Card className="mb-4 space-y-1.5 p-4 text-sm">
          {e.description && e.description !== categoryLabel(e.category) && <p><span className="text-muted">Description: </span>{e.description}</p>}
          {e.receiptRef && <p><span className="text-muted">Receipt ref: </span>{e.receiptRef}</p>}
          {receipt && <p><a href={`/api/receipts/${e.id}`} target="_blank" rel="noopener" className="font-medium text-accent hover:underline">View receipt image</a></p>}
        </Card>
      ) : null}
      {s.state === "none" ? (
        <Card><Empty>This expense is not shared with any tenant, so there is nothing to collect.</Empty></Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4"><p className="text-xs text-muted">Paid</p><p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{s.paidCount} of {s.total}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Collected</p><p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 sm:text-2xl">{formatINR(got)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Still to collect</p><p className={`mt-1 text-lg font-semibold tabular-nums sm:text-2xl ${owed ? "text-amber-700" : "text-emerald-700"}`}>{formatINR(owed)}</p></Card>
          </div>
          {s.state === "completed" && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Everyone has paid, so this expense is <strong>completed</strong>.</p>}
          <h2 className="mb-2 mt-6 text-sm font-semibold">Tenants</h2>
          <Table>
            <thead><tr><Th>Tenant</Th><Th>Month</Th><Th className="text-right">Share</Th><Th className="text-right">Paid</Th><Th>Status</Th></tr></thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.tenantId}>
                  <Td><Link className="font-medium hover:underline" href={`/admin/tenants/${r.tenantId}`}>{r.name}</Link></Td>
                  <Td>{r.month ? monthLabelShort(r.month) : "—"}</Td>
                  <Td className="text-right tabular-nums">{formatINR(r.amount)}</Td>
                  <Td className="text-right tabular-nums">{formatINR(r.paid)}</Td>
                  <Td>
                    <Badge kind={r.state === "paid" ? "paid" : r.waiting >= r.balance && r.balance > 0 ? "waiting" : r.state} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </>
  );
}
