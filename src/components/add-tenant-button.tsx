import Link from "next/link";
import { Plus, UsersRound } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { MAX_ACTIVE_TENANTS } from "@/lib/features";

/** "Add tenant" — replaced by a "full" note once the PG has its maximum number of active tenants. */
export function AddTenantButton({ active, variant = "primary" }: { active: number; variant?: "primary" | "secondary" }) {
  if (active >= MAX_ACTIVE_TENANTS) {
    return (
      <span title={`The PG already has ${MAX_ACTIVE_TENANTS} active tenants. Vacate someone to add a new one.`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-slate-50 px-3.5 text-sm font-medium text-slate-500">
        <UsersRound className="size-4" aria-hidden /> Full · {active}/{MAX_ACTIVE_TENANTS} tenants
      </span>
    );
  }
  return <Link href="/admin/tenants/new" className={buttonClass(variant === "secondary" ? "secondary" : undefined)}><Plus className="size-4" aria-hidden /> Add tenant</Link>;
}
