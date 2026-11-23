import { getDb } from "@/db/client";
import { listNotifications, unreadCount } from "@/services/notifications";
import { NotificationMenu } from "@/components/notification-menu";

const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Server side: fetches the count and the latest few notifications, then hands them to the small popover. */
export async function NotificationBell({ userId, href }: { userId: string; href: string }) {
  const db = getDb();
  const [n, latest] = await Promise.all([unreadCount(db, userId), listNotifications(db, userId, 6, 0)]);
  return (
    <NotificationMenu
      unread={n}
      allHref={href}
      items={latest.map((x) => ({ id: x.id, title: x.title, body: x.body, read: !!x.readAt, when: when(x.createdAt) }))}
    />
  );
}
