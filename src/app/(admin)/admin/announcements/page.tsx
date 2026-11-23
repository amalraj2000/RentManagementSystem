import Link from "next/link";
import { Pin, Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { Badge, buttonClass, EditLink, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { pageParam, slicePage } from "@/lib/page";
import { deleteAnnouncementAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { listAnnouncements } from "@/services/misc";

export const metadata = { title: "Announcements" };

export default async function Announcements({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageParam((await searchParams).page);
  const list = await listAnnouncements(getDb(), 500);
  const { items: pageList, total } = slicePage(list, page);
  return (
    <>
      <PageHeader title="Announcements" description="Visible to all tenants in their portal." actions={<Link href="/admin/announcements/new" className={buttonClass()}><Plus className="size-4" aria-hidden /> Post notice</Link>} />
      {list.length === 0 ? <Empty>No notices posted.</Empty> : (
        <Table>
          <thead><tr><Th>Title</Th><Th>Message</Th><Th>Posted</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {pageList.map((a) => (
              <tr key={a.id}>
                <Td className="font-medium">{a.title}</Td>
                <Td className="max-w-xs !whitespace-normal"><span className="line-clamp-2 text-muted">{a.body}</span></Td>
                <Td className="whitespace-nowrap">{a.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</Td>
                <Td>{a.pinned ? <span className="inline-flex items-center gap-1 text-xs font-medium text-accent"><Pin className="size-3.5" aria-hidden /> Pinned</span> : <Badge kind="active" />}</Td>
                <Td>
                  <RowActions>
                    <EditLink href={`/admin/announcements/${a.id}/edit`} />
                    <ConfirmButton label="Delete" title="Delete this notice?" action={deleteAnnouncementAction.bind(null, a.id)} confirmLabel="Delete" />
                  </RowActions>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={total} basePath="/admin/announcements" />
    </>
  );
}
