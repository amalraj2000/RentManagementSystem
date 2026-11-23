import { Pin } from "lucide-react";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { Card, Empty, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { deleteAnnouncementAction, postAnnouncementAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { listAnnouncements } from "@/services/misc";

export const metadata = { title: "Announcements" };

export default async function Announcements() {
  const list = await listAnnouncements(getDb(), 50);
  return (
    <>
      <PageHeader title="Announcements" description="Visible to all tenants in their portal." />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-3">
          {list.length === 0 && <Card><Empty>No notices posted.</Empty></Card>}
          {list.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold">{a.pinned && <Pin className="size-3.5 text-accent" aria-label="Pinned" />}{a.title}</h2>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{a.body}</p>
                  <p className="mt-2 text-xs text-muted">{a.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</p>
                </div>
                <ConfirmButton label="Delete" title="Delete this notice?" action={deleteAnnouncementAction.bind(null, a.id)} confirmLabel="Delete" />
              </div>
            </Card>
          ))}
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-sm font-semibold">Post a notice</h2>
          <ActionForm action={postAnnouncementAction} submit="Post" className="space-y-3">
            <Field label="Title"><Input name="title" required maxLength={120} /></Field>
            <Field label="Message"><Textarea name="body" required maxLength={2000} rows={5} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" className="size-4 accent-teal-700" /> Pin to top</label>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
