"use client";

import { useTransition } from "react";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { iconButtonClass } from "@/components/ui";
import { impersonateTenantAction } from "@/actions/impersonate";

/** One click: open the app as this tenant (read-only, 1 hour), no password needed. */
export function ImpersonateButton({ tenantId, name }: { tenantId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      title={`Login as ${name} (read-only view)`}
      aria-label={`Login as ${name}`}
      disabled={pending}
      className={iconButtonClass()}
      onClick={() =>
        start(async () => {
          const r = await impersonateTenantAction(tenantId); // on success the server redirects to the tenant's dashboard
          if (r && !r.ok) toast.error(r.error);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4 text-accent" aria-hidden />}
    </button>
  );
}
