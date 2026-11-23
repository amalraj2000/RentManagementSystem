import { Pin } from "lucide-react";
import { Card, Empty, PageHeader, Pager } from "@/components/ui";
import { pageParam, slicePage } from "@/lib/page";
import { getDb } from "@/db/client";
import { requireTenant } from "@/lib/session";
import { listAnnouncements } from "@/services/misc";

export const metadata = { title: "Notices" };

export default async function Notices({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireTenant();
  const page = pageParam((await searchParams).page);
  const { items: list, total, page: current } = slicePage(await listAnnouncements(getDb(), 500), page);
  return (
    <>
      <PageHeader title="Notices" />
      {list.length === 0 ? <Card><Empty>No notices.</Empty></Card> : (
        <div className="space-y-3">
          {list.map((n) => (
            <Card key={n.id} className="p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">{n.pinned && <Pin className="size-3.5 text-accent" aria-label="Pinned" />}{n.title}</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{n.body}</p>
              <p className="mt-2 text-xs text-muted">{n.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</p>
            </Card>
          ))}
        </div>
      )}
      <Pager page={current} total={total} basePath="/portal/notices" />
    </>
  );
}
