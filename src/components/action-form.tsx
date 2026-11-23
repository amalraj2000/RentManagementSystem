"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ban, Check, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button, cn, iconButtonClass } from "@/components/ui";
import type { ActionResult } from "@/lib/action";
import { attachLiveValidation, clearError, fieldsOf, problemWith, showError, validateForm } from "@/lib/form-validation";

type Action = (formData: FormData) => Promise<ActionResult>;

/** Submits to a server action, shows a toast, resets on success. Works without leaking any server code. */
export function ActionForm({
  action,
  children,
  submit = "Save",
  className,
  reset = true,
  onDone,
  variant,
  redirectTo,
}: {
  action: Action;
  children: ReactNode;
  submit?: string;
  className?: string;
  reset?: boolean;
  onDone?: () => void;
  variant?: "primary" | "secondary" | "danger";
  /** Navigate here after a successful save (e.g. back to the list). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  // Inside a pop-up (native <dialog>, e.g. the login box) a toast would hide BEHIND it, so the message is shown in the pop-up instead.
  const [popupError, setPopupError] = useState<string | null>(null);
  useEffect(() => (ref.current ? attachLiveValidation(ref.current) : undefined), []);
  return (
    <form
      ref={ref}
      noValidate
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const bad = validateForm(form);
        if (bad) {
          bad.focus();
          return;
        }
        const data = new FormData(form);
        const inPopup = !!form.closest("dialog");
        setPopupError(null);
        start(async () => {
          const r = await action(data);
          if (r.ok) {
            toast.success(r.message ?? "Saved");
            if (reset) ref.current?.reset();
            onDone?.();
            if (redirectTo) router.push(redirectTo);
            return;
          }
          // Show server-side errors under the matching field; fall back to a toast.
          const named = { ...(r.fields ?? {}), ...(r.field ? { [r.field]: r.error } : {}) };
          let first: HTMLElement | null = null;
          for (const el of fieldsOf(form)) {
            const msg = named[el.name];
            if (msg) {
              showError(el, msg);
              first ??= el;
            }
          }
          if (first) first.focus();
          else if (inPopup) setPopupError(r.error);
          else toast.error(r.error);
        });
      }}
    >
      {children}
      {popupError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{popupError}</p>}
      <Button type="submit" variant={variant} disabled={pending} className="mt-4">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {submit}
      </Button>
    </form>
  );
}

/** Button that asks for confirmation (native dialog, keyboard accessible) before running an action. */
export function ConfirmButton({
  action,
  label,
  title,
  body,
  confirmLabel = "Confirm",
  variant = "danger",
  className,
  withReason,
  extra,
  icon: iconProp,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  label: ReactNode;
  title: string;
  body?: string;
  confirmLabel?: string;
  variant?: "danger" | "secondary" | "primary";
  className?: string;
  withReason?: boolean;
  /** Extra form fields inside the dialog (validated like any form). */
  extra?: ReactNode;
  /** Show this icon instead of the text label (the label becomes the tooltip). */
  icon?: ReactNode;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false); // client only, so the portal never mismatches SSR
  // Table-row actions labelled exactly "Delete" / "Void" render as icon buttons.
  const icon =
    label === "Delete" ? <Trash2 className="size-4" aria-hidden /> : label === "Void" ? <Ban className="size-4" aria-hidden /> : label === "Approve" ? <Check className="size-4" aria-hidden /> : label === "Reject" ? <X className="size-4" aria-hidden /> : iconProp ?? null;
  return (
    <>
      {icon ? (
        <button type="button" title={String(label)} aria-label={String(label)} className={cn(iconButtonClass(variant === "danger" ? "danger" : variant === "primary" ? "primary" : "neutral"), className)} onClick={() => dlg.current?.showModal()}>
          {icon}
        </button>
      ) : (
        <Button type="button" variant={variant} className={cn("min-h-8 px-2.5", className)} onClick={() => dlg.current?.showModal()}>
          {label}
        </Button>
      )}
      {mounted && createPortal(
      <dialog ref={dlg} className="m-auto w-[min(26rem,92vw)] whitespace-normal rounded-xl border border-line bg-white p-5 text-left text-sm font-normal text-ink shadow-xl backdrop:bg-slate-900/40">
        <form
          method="dialog"
          noValidate
          onSubmit={(e) => {
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            if (submitter?.value !== "ok") return;
            e.preventDefault();
            const form = e.currentTarget;
            const bad = validateForm(form);
            if (bad) {
              bad.focus();
              return;
            }
            const data = new FormData(form);
            start(async () => {
              const r = await action(data);
              if (!r.ok) {
                const named = { ...(r.fields ?? {}), ...(r.field ? { [r.field]: r.error } : {}) };
                let shown = false;
                for (const el of fieldsOf(form)) if (named[el.name]) { showError(el, named[el.name]); shown = true; }
                if (shown) return;
                toast.error(r.error);
              } else toast.success(r.message ?? "Done");
              dlg.current?.close();
            });
          }}
        >
          <h2 className="text-base font-semibold">{title}</h2>
          {body && <p className="mt-1.5 text-sm text-muted">{body}</p>}
          {extra}
          {withReason && (
            <input name="reason" required minLength={3} maxLength={200} placeholder="Reason (required)" aria-label="Reason" className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm" onInput={(e) => clearError(e.currentTarget)} />
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="submit" value="cancel" variant="secondary" formNoValidate>Cancel</Button>
            <Button type="submit" value="ok" variant={variant === "danger" ? "danger" : "primary"} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>,
      document.body)}
    </>
  );
}
