import { BellOff, Check } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Card, Empty, PageHeader, Pager } from "@/components/ui";
import { markAllReadAction, openNotification } from "@/actions/notifications";
import { getDb } from "@/db/client";
import { offsetFor, PAGE_SIZE } from "@/lib/page";
import { countNotifications, listNotifications, unreadCount } from "@/services/notifications";

const when = (d: Date) => d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export async function NotificationList({ userId, basePath, page }: { userId: string; basePath: string; page: number }) {
  const db = getDb();
  const [rows, unread, total] = await Promise.all([listNotifications(db, userId, PAGE_SIZE, offsetFor(page)), unreadCount(db, userId), countNotifications(db, userId)]);
  return (
    <>
      <PageHeader title="Notifications" description={unread ? `${unread} unread` : "You're all caught up"} />
      {unread > 0 && (
        <ActionForm action={markAllReadAction} submit="Mark all as read" variant="secondary" reset={false} className="mb-3 [&>button]:mt-0">
          <span className="sr-only">Mark every notification as read</span>
        </ActionForm>
      )}
      {rows.length === 0 ? (
        <Card><Empty><BellOff className="mx-auto mb-2 size-6" aria-hidden />Nothing here yet.</Empty></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.slice(0, PAGE_SIZE).map((n) => (
              <li key={n.id}>
                <form action={openNotification.bind(null, n.id)}>
                  <button className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.readAt ? "" : "bg-accent-soft/30"}`}>
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} aria-label={n.readAt ? undefined : "Unread"} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.readAt ? "font-medium" : "font-semibold"}`}>{n.title}</span>
                      <span className="mt-0.5 block text-sm text-slate-600">{n.body}</span>
                      <span className="mt-1 block text-xs text-muted">{when(n.createdAt)}</span>
                    </span>
                    {n.readAt && <Check className="mt-1 size-4 shrink-0 text-muted" aria-label="Read" />}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pager page={page} total={total} basePath={basePath} />
    </>
  );
}
