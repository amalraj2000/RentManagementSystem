"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Brand } from "@/components/logo";
import { Field, Input } from "@/components/ui";
import { login } from "@/actions/auth";

const OPEN_EVENT = "loveshore:open-login";

/** Any button that opens the login pop-up. */
export function LoginTrigger({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      {children}
    </button>
  );
}

/**
 * The only login screen. It opens from any LoginTrigger, and automatically when the address has ?login=1
 * (that is where "please log in" redirects and the old /login link send people).
 */
export function LoginModal() {
  const ref = useRef<HTMLDialogElement>(null);
  const wantsOpen = useSearchParams().get("login") === "1";

  useEffect(() => {
    const open = () => {
      const d = ref.current;
      if (d && !d.open) d.showModal();
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    if (wantsOpen && ref.current && !ref.current.open) ref.current.showModal();
  }, [wantsOpen]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="login-title"
      onClose={() => {
        // keep the address tidy once the pop-up is closed
        if (new URL(window.location.href).searchParams.has("login")) window.history.replaceState(null, "", window.location.pathname);
      }}
      onClick={(e) => e.target === ref.current && ref.current?.close()} // click on the dimmed background closes it
      className="m-auto w-[min(24rem,92vw)] rounded-2xl border border-line bg-white p-0 text-left shadow-2xl backdrop:bg-slate-900/50"
    >
      <div className="relative p-6">
        <button type="button" aria-label="Close login" onClick={() => ref.current?.close()} className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink">
          <X className="size-5" aria-hidden />
        </button>
        <h2 id="login-title" className="flex justify-center"><Brand className="text-xl" markClassName="size-10" /></h2>
        <p className="mb-5 mt-2 text-center text-sm text-muted">Login to continue</p>
        <ActionForm action={login} submit="Login" reset={false} className="space-y-3 [&>button]:w-full">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
        </ActionForm>
        <p className="mt-4 text-xs text-muted">Accounts are created by the PG owner. Forgot your password? Ask the owner to reset it.</p>
      </div>
    </dialog>
  );
}
