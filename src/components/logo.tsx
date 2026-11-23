import { cn } from "@/components/ui";

/** The Loveshore "LS" mark: a rounded teal square, a bold white LS, and a little wave for the shore. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Loveshore logo" className={cn("size-8 shrink-0", className)}>
      <rect width="64" height="64" rx="15" fill="#0f766e" />
      <path d="M15 14h7.5v27H34v7.5H15z" fill="#fff" />
      <path d="M51 22c0-4.4-3.4-7.5-8-7.5-4.4 0-7.7 2.6-7.7 6.6 0 9 15.7 6.2 15.7 16.2 0 4.6-3.6 7.7-8.4 7.7-4.7 0-8-2.6-8.4-7.2" fill="none" stroke="#fff" strokeWidth="6.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 56.5c3.2-2.8 6.4-2.8 9.6 0s6.4 2.8 9.6 0 6.4-2.8 9.6 0 6.4 2.8 9.6 0 3.2-2 4.6-1.4" fill="none" stroke="#5eead4" strokeWidth="2.6" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

/** Logo + name, used in the sidebar, headers, login and the public page. */
export function Brand({ className, markClassName, name = "Loveshore" }: { className?: string; markClassName?: string; name?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <LogoMark className={markClassName} />
      <span className="truncate">{name}</span>
    </span>
  );
}
