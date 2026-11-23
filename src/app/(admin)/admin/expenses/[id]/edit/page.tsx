import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { ExpenseFields } from "@/components/expense-fields";
import { Card, PageHeader } from "@/components/ui";
import { updateExpenseAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { expenseAllocations, expenses } from "@/db/schema";
import { eligibleTenants } from "@/services/billing";
import { receiptInfo } from "@/services/misc";

export const metadata = { title: "Edit expense" };

export default async function EditExpense({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [e] = await getDb().select().from(expenses).where(eq(expenses.id, id));
  if (!e) notFound();
  if (e.utilityBillId) redirect("/admin/expenses");
  const db = getDb();
  const [receipt, tenants, allocs] = await Promise.all([receiptInfo(db, id), eligibleTenants(db, e.spentOn.slice(0, 7)), db.select().from(expenseAllocations).where(eq(expenseAllocations.expenseId, id))]);
  const shares = Object.fromEntries(allocs.map((a) => [a.tenantId, a.amountPaise]));
  return (
    <>
      <BackLink href="/admin/expenses" label="Expenses" />
      <PageHeader title="Edit expense" />
      <Card className="max-w-lg p-5">
        <ActionForm action={updateExpenseAction.bind(null, id)} redirectTo="/admin/expenses" reset={false}><ExpenseFields e={e} expenseId={id} receipt={receipt} tenants={tenants} shareMode={e.shareMode} shares={shares} /></ActionForm>
      </Card>
    </>
  );
}
