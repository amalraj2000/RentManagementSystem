import { Field, Input, Textarea } from "@/components/ui";

export function AnnouncementFields({ a }: { a?: { title: string; body: string; pinned: boolean } }) {
  return (
    <div className="space-y-3">
      <Field label="Title"><Input name="title" required minLength={2} maxLength={120} defaultValue={a?.title} /></Field>
      <Field label="Message"><Textarea name="body" required minLength={2} maxLength={2000} rows={6} defaultValue={a?.body} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" defaultChecked={a?.pinned} className="size-4 accent-teal-700" /> Pin to top</label>
    </div>
  );
}
