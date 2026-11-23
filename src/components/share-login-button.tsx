"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonClass, iconButtonClass } from "@/components/ui";
import { shareLoginAction } from "@/actions/admin";

type Shared = { whatsapp: string; message: string; name: string; email: string; password: string; url: string };

/**
 * Creates a fresh temporary password and opens WhatsApp with the login link, username and password prefilled.
 * (Existing passwords are hashed and cannot be read back — so sharing always means "issue a new temporary one".)
 */
export function ShareLoginButton({ tenantId, name }: { tenantId: string; name: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [shared, setShared] = useState<Shared | null>(null);
  const [copied, setCopied] = useState(false);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const close = () => {
    dlg.current?.close();
    setShared(null);
    setCopied(false);
  };
  return (
    <>
      <button type="button" title="Share login on WhatsApp" aria-label="Share login on WhatsApp" className={iconButtonClass()} onClick={() => dlg.current?.showModal()}>
        <MessageCircle className="size-4 text-emerald-600" aria-hidden />
      </button>
      {mounted && createPortal(
      <dialog ref={dlg} onClose={() => { setShared(null); setCopied(false); }} className="m-auto w-[min(28rem,92vw)] whitespace-normal rounded-xl border border-line bg-white p-5 text-left text-sm font-normal text-ink shadow-xl backdrop:bg-slate-900/40">
        {!shared ? (
          <>
            <h2 className="text-base font-semibold">Share login with {name}?</h2>
            <p className="mt-1.5 text-sm text-muted">
              This creates a <strong>new temporary password</strong> (the old one stops working and any logged-in sessions end), then opens WhatsApp with the login link, username and password ready to send. They must change the password when they first log in.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await shareLoginAction(tenantId);
                    if (r.ok) setShared(r.data as Shared);
                    else {
                      toast.error(r.error);
                      close();
                    }
                  })
                }
              >
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Create &amp; continue
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold">Login ready for {shared.name}</h2>
            <dl className="mt-3 space-y-1.5 rounded-lg border border-line bg-slate-50 p-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Link</dt><dd className="truncate font-medium">{shared.url}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Username</dt><dd className="truncate font-medium">{shared.email}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Password</dt><dd className="font-mono font-semibold tracking-wide">{shared.password}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-muted">Shown only now — it can&apos;t be viewed again. Send it privately.</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(shared.message).catch(() => toast.error("Couldn't copy"));
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy message"}
              </Button>
              <a href={shared.whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClass()}>
                <MessageCircle className="size-4" aria-hidden /> Open WhatsApp
              </a>
              <Button type="button" variant="ghost" onClick={close}>Done</Button>
            </div>
          </>
        )}
      </dialog>,
      document.body)}
    </>
  );
}
