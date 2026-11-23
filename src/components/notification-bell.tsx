import Link from "next/link";
import { Bell } from "lucide-react";
import { getDb } from "@/db/client";
import { unreadCount } from "@/services/notifications";

/** Server component: one cheap indexed count per page view. */
export async function NotificationBell({ userId, href }: { userId: string; href: string }) {
  const n = await unreadCount(getDb(), userId);
  return (
    <Link href={href} aria-label={n ? `Notifications, ${n} unread` : "Notifications"} title="Notifications" className="relative inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
      <Bell className="size-5" aria-hidden />
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">{n > 9 ? "9+" : n}</span>}
    </Link>
  );
}
