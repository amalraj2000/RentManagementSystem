import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ImageIcon, Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { buttonClass, EditLink, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { deleteExpenseAction, deleteUtilityAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { expenseAllocations, expenseReceipts, expenses } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { categoryLabel } from "@/lib/categories";
import { formatINR } from "@/lib/money";
import { offsetFor, PAGE_SIZE, pageParam } from "@/lib/page";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageParam((await searchParams).page);
  const rows = await getDb()
    .select({ id: expenses.id, category: expenses.category, amountPaise: expenses.amountPaise, spentOn: expenses.spentOn, description: expenses.description, receiptRef: expenses.receiptRef, utilityBillId: expenses.utilityBillId, shareMode: expenses.shareMode, hasImage: expenseReceipts.id })
    .from(expenses)
    .leftJoin(expenseReceipts, eq(expenseReceipts.expenseId, expenses.id))
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt)).limit(PAGE_SIZE).offset(offsetFor(page));
  const [{ total }] = await getDb().select({ total: sql<number>`count(*)` }).from(expenses);
  const counts = new Map((await getDb().select({ id: expenseAllocations.expenseId, n: sql<number>`count(*)`, total: sql<number>`sum(${expenseAllocations.amountPaise})` }).from(expenseAllocations).groupBy(expenseAllocations.expenseId)).map((r) => [r.id, r]));
  return (
    <>
      <PageHeader title="Expenses" description="Electricity and water bills go here too — choose the category, then “Share with tenants” to split them." actions={<Link href="/admin/expenses/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Add expense</Link>} />
      {rows.length === 0 ? <Empty>No expenses yet.</Empty> : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th>Receipt</Th><Th>Shared with tenants</Th><Th className="text-right">Amount</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {rows.slice(0, PAGE_SIZE).map((e) => (
              <tr key={e.id}>
                <Td>{formatDate(e.spentOn)}</Td>
                <Td>{categoryLabel(e.category)}</Td>
                <Td className="!whitespace-normal">{e.description === categoryLabel(e.category) ? <span className="text-muted">—</span> : e.description}{e.receiptRef && <span className="block text-xs text-muted">Ref: {e.receiptRef}</span>}</Td>
                <Td>{e.hasImage ? <a href={`/api/receipts/${e.id}`} target="_blank" rel="noopener" title="View receipt image" aria-label="View receipt image" className="inline-flex text-accent hover:text-accent-hover"><ImageIcon className="size-4" aria-hidden /></a> : <span className="text-muted">—</span>}</Td>
                <Td className="text-muted">{e.utilityBillId ? "Utility bill" : e.shareMode === "none" ? "—" : `${e.shareMode === "equal" ? "Equal" : "Custom"} · ${counts.get(e.id)?.n ?? 0} tenants · ${formatINR(Number(counts.get(e.id)?.total ?? 0))}`}</Td>
                <Td className="text-right tabular-nums">{formatINR(e.amountPaise)}</Td>
                <Td>
                  <RowActions>
                    {e.utilityBillId ? (
                      <>
                        <EditLink href={`/admin/${e.category}/${e.utilityBillId}/edit`} />
                        <ConfirmButton label="Delete" title="Delete this utility bill?" body="Removes the bill and its split from tenant invoices. Not allowed if payments were recorded against those invoices." action={deleteUtilityAction.bind(null, e.utilityBillId)} confirmLabel="Delete" />
                      </>
                    ) : (
                      <>
                        <EditLink href={`/admin/expenses/${e.id}/edit`} />
                        <ConfirmButton label="Delete" title="Delete this expense?" action={deleteExpenseAction.bind(null, e.id)} confirmLabel="Delete" />
                      </>
                    )}
                  </RowActions>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={Number(total)} basePath="/admin/expenses" />
    </>
  );
}
