import Link from "next/link";
import { SettingsTabs } from "@/components/settings-tabs";
import { Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { Badge, buttonClass, EditLink, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { pageParam, slicePage } from "@/lib/page";
import { deleteAdminAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/session";
import { listAdmins } from "@/services/admins";
import { userIdsWithPhotos } from "@/services/avatars";
import { Avatar } from "@/components/avatar";

export const metadata = { title: "Admins" };

export default async function AdminsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageParam((await searchParams).page);
  const me = await requireAdmin();
  const { items: admins, total } = slicePage(await listAdmins(getDb()), page);
  const withPhoto = await userIdsWithPhotos(getDb());
  const fmt = (d: Date | null) => d?.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) ?? "Never";
  return (
    <>
      <PageHeader title="Settings" description="Admins — people who can log in with full access." actions={<Link href="/admin/admins/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Add admin</Link>} />
      <SettingsTabs current="admins" />
      <Table>
        <thead><tr><Th>Name</Th><Th>Email</Th><Th>Last login</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
        <tbody>
          {admins.map((a) => (
            <tr key={a.id}>
              <Td className="font-medium"><span className="flex items-center gap-2.5"><Avatar src={withPhoto.has(a.id) ? `/api/avatars/${a.id}` : null} name={a.name} className="size-8 text-xs" />{a.name}{a.id === me.id && <span className="text-xs font-normal text-muted">(you)</span>}</span></Td>
              <Td>{a.email}</Td>
              <Td>{fmt(a.lastLoginAt)}</Td>
              <Td><Badge kind={a.isActive ? "active" : "disabled"} /></Td>
              <Td>
                <RowActions>
                  <EditLink href={a.id === me.id ? "/admin/profile" : `/admin/admins/${a.id}/edit`} />
                  {a.id !== me.id && <ConfirmButton label="Delete" title={`Delete ${a.name}?`} body="This removes their login. If they have recorded payments or bills, disable them instead." action={deleteAdminAction.bind(null, a.id)} confirmLabel="Delete" />}
                </RowActions>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pager page={page} total={total} basePath="/admin/admins" />
    </>
  );
}
