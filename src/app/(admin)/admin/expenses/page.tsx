import { desc } from "drizzle-orm";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { Card, Empty, Field, Input, PageHeader, Pager, Select, Table, Td, Th } from "@/components/ui";
import { addExpenseAction, deleteExpenseAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { expenses } from "@/db/schema";
import { formatDate, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PAGE_SIZE, pageParam } from "@/lib/page";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageParam((await searchParams).page);
  const rows = await getDb().select().from(expenses).orderBy(desc(expenses.spentOn), desc(expenses.createdAt)).limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE);
  return (
    <>
      <PageHeader title="Expenses" description="Utility bills are added here automatically when you save them on the Electricity / Water pages." />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div>
          {rows.length === 0 ? <Card><Empty>No expenses yet.</Empty></Card> : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th className="text-right">Amount</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {rows.slice(0, PAGE_SIZE).map((e) => (
                  <tr key={e.id}>
                    <Td>{formatDate(e.spentOn)}</Td>
                    <Td className="capitalize">{e.category}</Td>
                    <Td>{e.description}{e.receiptRef && <span className="block text-xs text-muted">Ref: {e.receiptRef}</span>}</Td>
                    <Td className="text-right tabular-nums">{formatINR(e.amountPaise)}</Td>
                    <Td>{!e.utilityBillId && <ConfirmButton label="Delete" title="Delete this expense?" action={deleteExpenseAction.bind(null, e.id)} confirmLabel="Delete" />}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath="/admin/expenses" />
        </div>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Add expense</h2>
          <ActionForm action={addExpenseAction} submit="Add expense" className="space-y-3">
            <Field label="Category">
              <Select name="category" defaultValue="cleaning">
                <option value="cleaning">Cleaning</option><option value="repairs">Repairs & maintenance</option><option value="internet">Internet</option><option value="electricity">Electricity</option><option value="water">Water</option><option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Amount (₹)"><Input name="amount" inputMode="decimal" required /></Field>
            <Field label="Date"><Input name="spentOn" type="date" required defaultValue={todayISO()} /></Field>
            <Field label="Description"><Input name="description" required maxLength={200} /></Field>
            <Field label="Receipt reference (optional)"><Input name="receiptRef" maxLength={300} /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
