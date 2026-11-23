import Link from "next/link";

const TABS = [
  { key: "general", href: "/admin/settings", label: "General" },
  { key: "website", href: "/admin/website", label: "Landing page" },
  { key: "admins", href: "/admin/admins", label: "Admins" },
  { key: "logs", href: "/admin/logs", label: "Logs" },
] as const;

/** Shared tab bar for everything under the Settings menu. */
export function SettingsTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Settings sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} aria-current={current === t.key ? "page" : undefined} className={`-mb-px whitespace-nowrap border-b-2 px-2.5 py-2 text-[13px] font-medium sm:px-3 sm:text-sm ${current === t.key ? "border-accent text-accent" : "border-transparent text-slate-600 hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
