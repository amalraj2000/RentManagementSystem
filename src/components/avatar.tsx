import { cn } from "@/components/ui";

/** Shows the private photo via the auth-checked route, falling back to initials. */
export function Avatar({ photoId, src, name, className }: { photoId?: string | null; src?: string | null; name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const url = src ?? (photoId ? `/api/documents/${photoId}` : null);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- private, authenticated, per-user; Next image optimisation/caching must not be used
    <img src={url} alt={`Photo of ${name}`} loading="lazy" className={cn("size-10 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent", className)}>{initials || "?"}</span>
  );
}
