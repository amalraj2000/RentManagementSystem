import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { ExpenseFields } from "@/components/expense-fields";
import { Card, PageHeader } from "@/components/ui";
import { addExpenseAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { currentMonth } from "@/lib/dates";
import { eligibleTenants } from "@/services/billing";

export const metadata = { title: "Add expense" };

export default async function NewExpense() {
  const tenants = await eligibleTenants(getDb(), currentMonth());
  return (
    <>
      <BackLink href="/admin/expenses" label="Expenses" />
      <PageHeader title="Add expense" />
      <Card className="max-w-lg p-5">
        <ActionForm action={addExpenseAction} submit="Add expense" redirectTo="/admin/expenses" reset={false}><ExpenseFields tenants={tenants} /></ActionForm>
      </Card>
    </>
  );
}
