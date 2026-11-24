import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { Badge, buttonClass, EditLink, Empty, iconButtonClass, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { deleteExpenseAction } from "@/actions/expenses";
import { getDb } from "@/db/client";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { pageParam, slicePage } from "@/lib/page";
import { requireAdmin } from "@/lib/session";
import { listExpenses } from "@/services/expenses";

export const metadata = { title: "Expenses" };

export default async function Expenses({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const list = await listExpenses(getDb());
  const { items, total, page } = slicePage(list, pageParam((await searchParams).page));
  return (
    <>
      <PageHeader title="Expenses" description="Shared costs split between the active tenants. Separate from rent." actions={<Link href="/admin/expenses/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Add expense</Link>} />
      {list.length === 0 ? <Empty>No expenses yet.</Empty> : (
        <Table>
          <thead><tr><Th>Expense</Th><Th>Date</Th><Th className="text-right">Total</Th><Th>Paid</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id}>
                <Td><Link className="font-medium hover:underline" href={`/admin/expenses/${e.id}`}>{e.title}</Link></Td>
                <Td>{formatDate(e.expenseDate)}</Td>
                <Td className="text-right tabular-nums">{formatINR(e.amountPaise)}</Td>
                <Td>{e.paid} of {e.total} paid{e.waiting > 0 && <span className="ml-2 rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white" title="Waiting for you to confirm">{e.waiting}</span>}</Td>
                <Td><Badge kind={e.paid === e.total ? "paid" : "due"} /></Td>
                <Td>
                  <RowActions>
                    <Link href={`/admin/expenses/${e.id}`} title="View" aria-label="View" className={iconButtonClass()}><Eye className="size-4" aria-hidden /></Link>
                    <EditLink href={`/admin/expenses/${e.id}/edit`} />
                    <ConfirmButton label="Delete" title={`Delete "${e.title}"?`} body="Only possible while no tenant has paid it." action={deleteExpenseAction.bind(null, e.id)} confirmLabel="Delete" />
                  </RowActions>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={total} basePath="/admin/expenses" />
    </>
  );
}
