"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { Avatar } from "@/components/avatar";

/** Header profile menu: avatar + name, with "Profile settings" and "Logout". Closes on outside click / Esc. */
export function UserMenu({ name, email, roleLabel, photoId, photoSrc, profileHref, logoutAction }: { name: string; email: string; roleLabel: string; photoId?: string | null; photoSrc?: string | null; profileHref: string; logoutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
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
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100">
        <Avatar photoId={photoId} src={photoSrc} name={name} className="size-8 text-xs" />
        <span className="hidden max-w-36 truncate text-sm font-medium sm:inline">{name}</span>
        <ChevronDown className="size-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
            <p className="mt-0.5 text-xs text-muted">{roleLabel}</p>
          </div>
          <div className="p-1">
            <Link role="menuitem" href={profileHref} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
              <Settings className="size-4 text-muted" aria-hidden /> Profile settings
            </Link>
            <form action={logoutAction}>
              <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">
                <LogOut className="size-4" aria-hidden /> Logout
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
