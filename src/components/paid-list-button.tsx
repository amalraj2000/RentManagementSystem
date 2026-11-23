"use client";

import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button, cn, iconButtonClass } from "@/components/ui";

/**
 * An icon button that opens a pop-up with whatever you pass as children (here: a tenant's paid list).
 * The pop-up is drawn on the page itself, not inside the table row, so it is never clipped.
 */
export function PopupButton({ icon, label, title, children, className }: { icon: ReactNode; label: string; title: string; children: ReactNode; className?: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  return (
    <>
      <button type="button" title={label} aria-label={label} className={cn(iconButtonClass(), className)} onClick={() => dlg.current?.showModal()}>{icon}</button>
      {mounted && createPortal(
        <dialog
          ref={dlg}
          aria-label={title}
          onClick={(e) => e.target === dlg.current && dlg.current?.close()} // click on the dimmed background closes it
          className="m-auto w-[min(32rem,94vw)] whitespace-normal rounded-xl border border-line bg-white p-0 text-left text-sm font-normal text-ink shadow-xl backdrop:bg-slate-900/40"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" aria-label="Close" onClick={() => dlg.current?.close()} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink"><X className="size-5" aria-hidden /></button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">{children}</div>
          <div className="flex justify-end border-t border-line px-5 py-3"><Button type="button" variant="secondary" onClick={() => dlg.current?.close()}>Close</Button></div>
        </dialog>,
        document.body,
      )}
    </>
  );
}
