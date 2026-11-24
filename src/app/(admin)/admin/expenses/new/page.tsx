import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { ExpenseFields } from "@/components/expense-fields";
import { Card, PageHeader } from "@/components/ui";
import { addExpenseAction } from "@/actions/expenses";

export const metadata = { title: "Add expense" };

export default function NewExpense() {
  return (
    <>
      <BackLink href="/admin/expenses" label="Expenses" />
      <PageHeader title="Add expense" description="Shared equally between everyone who is an active tenant today. Kept separate from rent." />
      <Card className="max-w-xl p-5">
        <ActionForm action={addExpenseAction} submit="Add expense" redirectTo="/admin/expenses" reset={false}><ExpenseFields /></ActionForm>
      </Card>
    </>
  );
}
