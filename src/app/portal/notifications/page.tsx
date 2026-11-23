import { NotificationList } from "@/components/notification-list";
import { pageParam } from "@/lib/page";
import { requireTenant } from "@/lib/session";

export const metadata = { title: "Notifications" };

export default async function PortalNotifications({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const me = await requireTenant();
  return <NotificationList userId={me.id} basePath="/portal/notifications" page={pageParam((await searchParams).page)} />;
}
