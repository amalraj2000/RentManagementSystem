import { NotificationList } from "@/components/notification-list";
import { pageParam } from "@/lib/page";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Notifications" };

export default async function AdminNotifications({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const me = await requireAdmin();
  return <NotificationList userId={me.id} basePath="/admin/notifications" page={pageParam((await searchParams).page)} />;
}
