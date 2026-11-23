import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

export const cn = clsx;

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-card border border-line bg-white", className)} {...p} />;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" | "good" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "warn" && "text-amber-700", tone === "good" && "text-accent")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const btn = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const buttonClass = (variant: "primary" | "secondary" | "danger" | "ghost" = "primary") =>
  cn(
    btn,
    variant === "primary" && "bg-accent text-white hover:bg-accent-hover",
    variant === "secondary" && "border border-line bg-white text-ink hover:bg-slate-50",
    variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
    variant === "ghost" && "text-muted hover:bg-slate-100",
  );

export function Button({ variant, className, ...p }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return <button className={cn(buttonClass(variant), className)} {...p} />;
}

const field = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent";
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block text-sm", className)}>
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
export const Input = (p: ComponentProps<"input">) => <input {...p} className={cn(field, p.className)} />;
export const Select = (p: ComponentProps<"select">) => <select {...p} className={cn(field, p.className)} />;
export const Textarea = (p: ComponentProps<"textarea">) => <textarea rows={3} {...p} className={cn(field, p.className)} />;

const tones: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  partial: "bg-amber-50 text-amber-800 ring-amber-200",
  notice: "bg-amber-50 text-amber-800 ring-amber-200",
  unpaid: "bg-slate-100 text-slate-700 ring-slate-200",
  overdue: "bg-red-50 text-red-700 ring-red-200",
  moved_out: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
  voided: "bg-slate-100 text-slate-500 ring-slate-200",
};
const labels: Record<string, string> = { moved_out: "Moved out", partial: "Partially paid", notice: "Notice period" };
export function Badge({ kind }: { kind: string }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[kind] ?? tones.unpaid)}>
      {labels[kind] ?? kind[0].toUpperCase() + kind.slice(1)}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">{children}</table>
    </Card>
  );
}
export const Th = (p: ComponentProps<"th">) => <th {...p} className={cn("whitespace-nowrap border-b border-line bg-slate-50 px-3 py-2 text-xs font-medium text-muted", p.className)} />;
export const Td = (p: ComponentProps<"td">) => <td {...p} className={cn("border-b border-line px-3 py-2.5 last:border-0", p.className)} />;

export function Pager({ page, hasMore, basePath, params = {} }: { page: number; hasMore: boolean; basePath: string; params?: Record<string, string | undefined> }) {
  const href = (n: number) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    q.set("page", String(n));
    return `${basePath}?${q}`;
  };
  if (page <= 1 && !hasMore) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      {page > 1 ? <a className={buttonClass("secondary")} href={href(page - 1)}>← Newer</a> : <span />}
      <span className="text-muted">Page {page}</span>
      {hasMore ? <a className={buttonClass("secondary")} href={href(page + 1)}>Older →</a> : <span />}
    </div>
  );
}
