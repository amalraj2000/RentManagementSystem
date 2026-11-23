import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { Badge, Card, Field, Input, PageHeader } from "@/components/ui";
import { resetAdminPasswordAction, toggleAdminAction, updateAdminAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Edit admin" };

export default async function EditAdmin({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (id === me.id) redirect("/admin/profile");
  const [u] = await getDb().select().from(users).where(and(eq(users.id, id), eq(users.role, "admin")));
  if (!u) notFound();
  return (
    <>
      <BackLink href="/admin/admins" label="Admins" />
      <PageHeader title="Edit admin" actions={<Badge kind={u.isActive ? "active" : "disabled"} />} />
      <div className="grid max-w-4xl gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Details</h2>
          <ActionForm action={updateAdminAction.bind(null, id)} redirectTo="/admin/admins" reset={false} className="space-y-3">
            <Field label="Name"><Input name="name" required minLength={2} maxLength={100} defaultValue={u.name} /></Field>
            <Field label="Email (login)"><Input name="email" type="email" required defaultValue={u.email} /></Field>
          </ActionForm>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Reset password</h2>
            <ActionForm action={resetAdminPasswordAction.bind(null, id)} submit="Reset password">
              <Field label="Temporary password" hint="They must change it on next login and are logged out everywhere."><Input name="password" required minLength={10} autoComplete="off" /></Field>
            </ActionForm>
          </Card>
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold">Access</h2>
            <p className="mb-3 text-sm text-muted">{u.isActive ? "Disabling logs them out and blocks login." : "This admin can't log in."}</p>
            <ConfirmButton variant="secondary" label={u.isActive ? "Disable admin" : "Enable admin"} title={u.isActive ? `Disable ${u.name}?` : `Enable ${u.name}?`} action={toggleAdminAction.bind(null, id, !u.isActive)} confirmLabel="Confirm" />
          </Card>
        </div>
      </div>
    </>
  );
}
