"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { markAllReadAction, openNotificationFromForm } from "@/actions/notifications";

export type MenuItem = { id: string; title: string; body: string; read: boolean; when: string };

/** The bell: opens a small notification box with the latest items (not a whole page). "View all" opens the full list. */
export function NotificationMenu({ items, unread, allHref }: { items: MenuItem[]; unread: number; allHref: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        onClick={() => setOpen(!open)}
        className="relative inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-14 z-50 overflow-hidden rounded-xl border border-line bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications{unread > 0 && <span className="ml-1.5 text-xs font-normal text-muted">{unread} unread</span>}</p>
            {unread > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => { await markAllReadAction(); router.refresh(); })}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
              >
                <CheckCheck className="size-3.5" aria-hidden /> Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted"><BellOff className="mx-auto mb-2 size-6" aria-hidden />You&apos;re all caught up.</div>
          ) : (
            <ul className="max-h-[min(22rem,60dvh)] divide-y divide-line overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <form action={openNotificationFromForm}>
                    <input type="hidden" name="id" value={n.id} />
                    <button className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50 ${n.read ? "" : "bg-accent-soft/30"}`}>
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-accent"}`} aria-label={n.read ? undefined : "Unread"} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${n.read ? "font-medium" : "font-semibold"}`}>{n.title}</span>
                        <span className="line-clamp-2 text-xs text-slate-600">{n.body}</span>
                        <span className="mt-0.5 block text-[11px] text-muted">{n.when}</span>
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <Link href={allHref} onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-sm font-medium text-accent hover:bg-slate-50">View all notifications</Link>
        </div>
      )}
    </div>
  );
}
