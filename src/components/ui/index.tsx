import { clsx } from "clsx";
import { Children, cloneElement, isValidElement, type ReactElement } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Eye, Pencil, ScrollText, UserPlus } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export const cn = clsx;

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-card border border-line bg-white", className)} {...p} />;
}

export function Stat({ label, value, hint, tone, compact }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" | "good"; compact?: boolean }) {
  return (
    <Card className={compact ? "min-w-0 p-3 sm:p-4" : "p-4"}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 font-semibold tabular-nums", compact ? "text-sm tracking-tight min-[400px]:text-[15px] sm:text-xl" : "text-xl", tone === "warn" && "text-amber-700", tone === "good" && "text-accent")}>{value}</p>
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
  disabled: "bg-slate-100 text-slate-600 ring-slate-200",
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  waiting: "bg-amber-50 text-amber-800 ring-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  voided: "bg-slate-100 text-slate-500 ring-slate-200",
  completed: "bg-slate-100 text-slate-600 ring-slate-200",
  not_billed: "bg-slate-100 text-slate-500 ring-slate-200",
};
const labels: Record<string, string> = { cancelled: "Cancelled", rejected: "Rejected", waiting: "Waiting for confirmation", pending: "Waiting", moved_out: "Vacated", partial: "Partly paid", notice: "Notice period", completed: "Completed", not_billed: "Not billed yet" };
export function Badge({ kind, wrap }: { kind: string; wrap?: boolean }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", wrap ? "whitespace-normal text-center leading-tight" : "whitespace-nowrap", tones[kind] ?? tones.unpaid)}>
      {labels[kind] ?? kind[0].toUpperCase() + kind.slice(1)}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

/** Plain text of a node (ignores screen-reader-only bits) — used to turn column headings into mobile labels. */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    const p = node.props as { className?: string; children?: ReactNode };
    return p.className?.includes("sr-only") ? "" : textOf(p.children);
  }
  return "";
}
const NO_LABEL = new Set(["action", "actions", "view", ""]);

/** Copies each column heading onto the cells beneath it (as `data-label`) so rows can become cards on phones. */
function labelCells(node: ReactNode, labels: string[]): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) return child;
    const el = child as ReactElement<{ children?: ReactNode; label?: string; "data-label"?: string }>;
    if (el.type === "tr") {
      let i = 0;
      return cloneElement(el, undefined, Children.map(el.props.children, (cell) => {
        if (!isValidElement(cell)) return cell;
        const label = labels[i++] ?? "";
        return typeof cell.type === "string" ? cloneElement(cell as ReactElement<{ "data-label"?: string }>, { "data-label": label }) : cloneElement(cell as ReactElement<{ label?: string }>, { label });
      }));
    }
    return el.props.children !== undefined ? cloneElement(el, undefined, labelCells(el.props.children, labels)) : el;
  });
}

/**
 * Tables are normal tables on larger screens and turn into one card per row on phones (nothing is cut off or needs
 * sideways scrolling). Use `compact` for small numeric tables that already fit on a phone.
 */
export function Table({ children, compact, className }: { children: ReactNode; compact?: boolean; className?: string }) {
  let labels: string[] = [];
  let body: ReactNode = children;
  if (!compact) {
    Children.forEach(children, (c) => {
      if (isValidElement(c) && c.type === "thead") {
        Children.forEach((c.props as { children?: ReactNode }).children, (tr) => {
          if (isValidElement(tr) && tr.type === "tr") {
            labels = Children.toArray((tr.props as { children?: ReactNode }).children).map((th) => {
              const t = textOf(th).trim();
              return NO_LABEL.has(t.toLowerCase()) ? "" : t;
            });
          }
        });
      }
    });
    body = Children.map(children, (c) => (isValidElement(c) && c.type === "tbody" ? labelCells(c, labels) : c));
  }
  return (
    <Card className={cn("overflow-x-auto", !compact && "max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent")}>
      <table className={cn("w-full text-left text-sm [&_tbody_tr:last-child_td]:border-b-0", compact ? "" : "rt-cards min-w-0 sm:min-w-[34rem]", className)}>{body}</table>
    </Card>
  );
}
export const Th = (p: ComponentProps<"th">) => <th {...p} className={cn("whitespace-nowrap border-b border-line bg-slate-50 px-3 py-2 text-xs font-medium text-muted", p.className)} />;
export const Td = ({ label, ...p }: ComponentProps<"td"> & { label?: string }) => <td {...p} data-label={label} className={cn("whitespace-nowrap border-b border-line px-3 py-2.5", p.className)} />;

const PER_PAGE = 10;

/**
 * Pagination. Appears only when there are more than 10 rows.
 * Pass `total` for numbered pages ("Showing 11–20 of 34"); `hasMore` alone gives simple Newer/Older links.
 */
export function Pager({ page, hasMore, total, basePath, params = {} }: { page: number; hasMore?: boolean; total?: number; basePath: string; params?: Record<string, string | undefined> }) {
  const href = (n: number) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    if (n > 1) q.set("page", String(n));
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const btn = "inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-medium";
  if (total === undefined) {
    if (page <= 1 && !hasMore) return null;
    return (
      <nav aria-label="Pagination" className="mt-3 flex items-center justify-between text-sm">
        {page > 1 ? <a className={buttonClass("secondary")} href={href(page - 1)}>← Newer</a> : <span />}
        <span className="text-muted">Page {page}</span>
        {hasMore ? <a className={buttonClass("secondary")} href={href(page + 1)}>Older →</a> : <span />}
      </nav>
    );
  }
  const pages = Math.ceil(total / PER_PAGE);
  if (page > pages && pages >= 1) redirect(href(pages)); // asked for a page past the end: show the last page instead of an empty list
  if (pages <= 1) return null;
  const cur = Math.min(page, pages);
  const from = (cur - 1) * PER_PAGE + 1;
  const to = Math.min(cur * PER_PAGE, total);
  const start = Math.max(1, Math.min(cur - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
      <p className="text-xs text-muted">Showing {from}–{to} of {total}</p>
      <ul className="flex items-center gap-1">
        <li>{cur > 1 ? <a href={href(cur - 1)} aria-label="Previous page" className={cn(btn, "border-line bg-white hover:bg-slate-50")}>‹</a> : <span aria-hidden className={cn(btn, "border-transparent text-slate-300")}>‹</span>}</li>
        {nums.map((n) => (
          <li key={n}>
            <a href={href(n)} aria-label={`Page ${n}`} aria-current={n === cur ? "page" : undefined} className={cn(btn, n === cur ? "border-accent bg-accent text-white" : "border-line bg-white hover:bg-slate-50")}>{n}</a>
          </li>
        ))}
        <li>{cur < pages ? <a href={href(cur + 1)} aria-label="Next page" className={cn(btn, "border-line bg-white hover:bg-slate-50")}>›</a> : <span aria-hidden className={cn(btn, "border-transparent text-slate-300")}>›</span>}</li>
      </ul>
    </nav>
  );
}

/** Edit link + optional delete slot for table rows. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="ml-auto flex max-w-[8.5rem] flex-wrap items-center justify-end gap-1.5 sm:max-w-[13rem] md:max-w-[8.5rem] xl:max-w-none">{children}</div>;
}
const iconBtn = "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors";
export const iconButtonClass = (tone: "neutral" | "danger" | "primary" = "neutral") =>
  cn(iconBtn, tone === "danger" ? "border-red-200 bg-white text-red-700 hover:bg-red-50" : tone === "primary" ? "border-accent bg-accent text-white hover:bg-accent-hover" : "border-line bg-white text-slate-600 hover:bg-slate-50 hover:text-ink");

const editIcons: Record<string, ReactNode> = {
  Edit: <Pencil className="size-4" aria-hidden />,
  "Edit / move": <Pencil className="size-4" aria-hidden />,
  Open: <Eye className="size-4" aria-hidden />,
  "View logs": <ScrollText className="size-4" aria-hidden />,
  "Assign tenant": <UserPlus className="size-4" aria-hidden />,
};
/** Icon-only link for table rows; the label is the tooltip and the accessible name. */
export const EditLink = ({ href, label = "Edit" }: { href: string; label?: string }) => (
  <Link href={href} title={label} aria-label={label} className={iconButtonClass()}>
    {editIcons[label] ?? <Pencil className="size-4" aria-hidden />}
  </Link>
);
