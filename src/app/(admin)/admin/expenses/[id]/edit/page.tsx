import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { ExpenseFields } from "@/components/expense-fields";
import { Card, PageHeader } from "@/components/ui";
import { updateExpenseAction } from "@/actions/expenses";
import { getDb } from "@/db/client";
import { expenses } from "@/db/schema";

export const metadata = { title: "Edit expense" };

export default async function EditExpense({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [e] = await getDb().select().from(expenses).where(eq(expenses.id, id));
  if (!e) notFound();
  return (
    <>
      <BackLink href={`/admin/expenses/${id}`} label="Expense" />
      <PageHeader title="Edit expense" description="Once a tenant has paid, only the title, date and note can change." />
      <Card className="max-w-xl p-5">
        <ActionForm action={updateExpenseAction.bind(null, id)} redirectTo={`/admin/expenses/${id}`} reset={false}><ExpenseFields e={e} /></ActionForm>
      </Card>
    </>
  );
}
