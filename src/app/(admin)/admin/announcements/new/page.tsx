import { ActionForm } from "@/components/action-form";
import { AnnouncementFields } from "@/components/announcement-fields";
import { BackLink } from "@/components/back-link";
import { Card, PageHeader } from "@/components/ui";
import { postAnnouncementAction } from "@/actions/admin";

export const metadata = { title: "Post notice" };

export default function NewAnnouncement() {
  return (
    <>
      <BackLink href="/admin/announcements" label="Announcements" />
      <PageHeader title="Post a notice" />
      <Card className="max-w-xl p-5">
        <ActionForm action={postAnnouncementAction} submit="Post" redirectTo="/admin/announcements" reset={false}><AnnouncementFields /></ActionForm>
      </Card>
    </>
  );
}
