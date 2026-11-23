import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { createAdminAction } from "@/actions/admin";

export const metadata = { title: "Add admin" };

export default function NewAdmin() {
  return (
    <>
      <BackLink href="/admin/admins" label="Admins" />
      <PageHeader title="Add admin" description="They must change the temporary password on first login." />
      <Card className="max-w-lg p-5">
        <ActionForm action={createAdminAction} submit="Create admin" redirectTo="/admin/admins" reset={false} className="space-y-3">
          <Field label="Name"><Input name="name" required minLength={2} maxLength={100} /></Field>
          <Field label="Email (login)"><Input name="email" type="email" required autoComplete="off" /></Field>
          <Field label="Temporary password" hint="At least 10 characters."><Input name="password" required minLength={10} autoComplete="off" /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
