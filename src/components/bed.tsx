import Link from "next/link";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { cn } from "@/components/ui";

/**
 * One bed, drawn as a bed: two pillows at the head, a round avatar of whoever sleeps there (photo or initials),
 * their name, and a blanket stripe at the foot. A vacant bed is a dashed outline you can tap to assign someone.
 */
export function Bed({ number, tenantId, tenantName, photoId, assignHref }: { number: number; tenantId: string | null; tenantName: string | null; photoId: string | null; assignHref: string }) {
  const occupied = !!tenantId && !!tenantName;
  const pillows = (
    <span className="flex gap-1.5" aria-hidden>
      <i className={cn("h-2.5 w-9 rounded-full ring-1", occupied ? "bg-white ring-slate-200" : "bg-white/70 ring-slate-200")} />
      <i className={cn("h-2.5 w-9 rounded-full ring-1", occupied ? "bg-white ring-slate-200" : "bg-white/70 ring-slate-200")} />
    </span>
  );
  const base = "group flex w-full flex-col items-center rounded-2xl border-2 px-2.5 pb-2.5 pt-2.5 text-center transition";
  if (occupied) {
    return (
      <Link href={`/admin/tenants/${tenantId}`} aria-label={`Bed ${number}: ${tenantName}`} className={cn(base, "border-accent/30 bg-accent-soft/40 hover:border-accent hover:shadow-sm")}>
        {pillows}
        <span className="mt-2.5 rounded-full ring-4 ring-white shadow-sm"><Avatar photoId={photoId} name={tenantName} className="size-14 text-lg" /></span>
        <span className="mt-2 w-full truncate text-sm font-semibold">{tenantName}</span>
        <span className="text-[11px] text-muted">Bed {number}</span>
        <i className="mt-2.5 h-1.5 w-full rounded-full bg-accent/25" aria-hidden />
      </Link>
    );
  }
  return (
    <Link href={assignHref} aria-label={`Bed ${number}: vacant — assign a tenant`} className={cn(base, "border-dashed border-slate-300 bg-slate-50 hover:border-accent hover:bg-accent-soft/30")}>
      {pillows}
      <span className="mt-2.5 grid size-14 place-items-center rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400 group-hover:border-accent group-hover:text-accent"><Plus className="size-6" aria-hidden /></span>
      <span className="mt-2 text-sm font-medium text-slate-500">Vacant</span>
      <span className="text-[11px] text-muted">Bed {number} · tap to assign</span>
      <i className="mt-2.5 h-1.5 w-full rounded-full bg-slate-200" aria-hidden />
    </Link>
  );
}
