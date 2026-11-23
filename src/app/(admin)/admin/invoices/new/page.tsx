import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { generateInvoicesAction } from "@/actions/admin";
import { monthParam } from "@/lib/page";

export const metadata = { title: "Generate invoices" };

export default async function GenerateInvoices({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = monthParam((await searchParams).month);
  return (
    <>
      <BackLink href="/admin/invoices" label="Rent & invoices" />
      <PageHeader title="Generate invoices" description="Creates a rent invoice for every eligible resident, and attaches any saved electricity / water bills. Safe to run again — existing invoices are never duplicated." />
      <Card className="max-w-md p-5">
        <ActionForm action={generateInvoicesAction} submit="Generate invoices" redirectTo={`/admin/invoices?month=${month}`} reset={false} className="space-y-3">
          <Field label="Billing month"><Input name="month" type="month" required defaultValue={month} /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
