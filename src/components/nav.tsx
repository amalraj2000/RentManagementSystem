"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/components/ui";

export type NavItem = { href: string; label: string; icon: ReactNode; /** Extra path prefixes that should also highlight this item. */ match?: string[] };

/** Sidebar (desktop) / drawer (mobile) for navigation; a top header carries the bell and the profile menu on every screen. */
export function AppShell({ items, brand, bell, userMenu, children }: { items: NavItem[]; brand: string; bell?: ReactNode; userMenu?: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (i: NavItem) => (i.href === "/admin" || i.href === "/portal" ? path === i.href : [i.href, ...(i.match ?? [])].some((h) => path.startsWith(h)));
  const links = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          onClick={() => setOpen(false)}
          aria-current={isActive(i) ? "page" : undefined}
          className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium", isActive(i) ? "bg-accent-soft text-accent" : "text-slate-600 hover:bg-slate-100")}
        >
          <span className="size-4 shrink-0 [&>svg]:size-4" aria-hidden>{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[14rem_1fr]">
      <aside className="no-print hidden border-r border-line bg-white p-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="px-3 py-3 text-base font-semibold">{brand}</div>
        <div className="flex-1 overflow-y-auto">{links}</div>
      </aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-white/95 px-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-1">
            <button aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-lg p-2 hover:bg-slate-100 lg:hidden">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <span className="font-semibold lg:hidden">{brand}</span>
          </div>
          <div className="flex items-center gap-1">
            {bell}
            {userMenu}
          </div>
        </header>
        {open && (
          <div className="no-print fixed inset-x-0 top-14 z-20 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-line bg-white p-3 shadow-lg lg:hidden">{links}</div>
        )}
        <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
