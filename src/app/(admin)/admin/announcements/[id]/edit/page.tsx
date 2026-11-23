import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { AnnouncementFields } from "@/components/announcement-fields";
import { BackLink } from "@/components/back-link";
import { Card, PageHeader } from "@/components/ui";
import { updateAnnouncementAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { announcements } from "@/db/schema";

export const metadata = { title: "Edit notice" };

export default async function EditAnnouncement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [a] = await getDb().select().from(announcements).where(eq(announcements.id, id));
  if (!a) notFound();
  return (
    <>
      <BackLink href="/admin/announcements" label="Announcements" />
      <PageHeader title="Edit notice" />
      <Card className="max-w-xl p-5">
        <ActionForm action={updateAnnouncementAction.bind(null, id)} redirectTo="/admin/announcements" reset={false}><AnnouncementFields a={a} /></ActionForm>
      </Card>
    </>
  );
}
