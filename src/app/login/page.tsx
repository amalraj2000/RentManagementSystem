import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input } from "@/components/ui";
import { login } from "@/actions/auth";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const u = await getCurrentUser();
  if (u) redirect(u.role === "admin" ? "/admin" : "/portal");
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">PG Manager</h1>
        <p className="mb-5 mt-1 text-sm text-muted">Sign in to continue</p>
        <ActionForm action={login} submit="Sign in" reset={false} className="space-y-3 [&>button]:w-full">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
        </ActionForm>
        <p className="mt-4 text-xs text-muted">Accounts are created by the PG owner. Forgot your password? Ask the owner to reset it.</p>
      </Card>
    </main>
  );
}
