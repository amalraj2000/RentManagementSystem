"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, cn } from "@/components/ui";
import type { ActionResult } from "@/lib/action";

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
}: {
  action: Action;
  children: ReactNode;
  submit?: string;
  className?: string;
  reset?: boolean;
  onDone?: () => void;
  variant?: "primary" | "secondary" | "danger";
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const r = await action(data);
          if (r.ok) {
            toast.success(r.message ?? "Saved");
            if (reset) ref.current?.reset();
            onDone?.();
          } else toast.error(r.error);
        });
      }}
    >
      {children}
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
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  label: ReactNode;
  title: string;
  body?: string;
  confirmLabel?: string;
  variant?: "danger" | "secondary" | "primary";
  className?: string;
  withReason?: boolean;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" variant={variant} className={cn("min-h-8 px-2.5", className)} onClick={() => dlg.current?.showModal()}>
        {label}
      </Button>
      <dialog ref={dlg} className="m-auto w-[min(26rem,92vw)] rounded-xl border border-line p-5 shadow-xl backdrop:bg-slate-900/40">
        <form
          method="dialog"
          onSubmit={(e) => {
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            if (submitter?.value !== "ok") return;
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            start(async () => {
              const r = await action(data);
              if (r.ok) toast.success(r.message ?? "Done");
              else toast.error(r.error);
              dlg.current?.close();
            });
          }}
        >
          <h2 className="text-base font-semibold">{title}</h2>
          {body && <p className="mt-1.5 text-sm text-muted">{body}</p>}
          {withReason && (
            <input name="reason" required maxLength={200} placeholder="Reason (required)" className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm" />
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="submit" value="cancel" variant="secondary" formNoValidate>Cancel</Button>
            <Button type="submit" value="ok" variant={variant === "danger" ? "danger" : "primary"} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
