import Link from "next/link";
import { SettingsTabs } from "@/components/settings-tabs";
import { Search } from "lucide-react";
import { Badge, EditLink, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { offsetFor, PAGE_SIZE, pageParam } from "@/lib/page";
import { requireAdmin } from "@/lib/session";
import { countUsers, listUsersWithActivity } from "@/services/logs";

export const metadata = { title: "Logs" };

const TABS = [["all", "Everyone"], ["admin", "Admins"], ["tenant", "Tenants"]] as const;
const when = (d: Date | null) => d?.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) ?? "—";

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ page?: string; role?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const role = sp.role === "admin" || sp.role === "tenant" ? sp.role : undefined;
  const q = (sp.q ?? "").slice(0, 60);
  const [rows, total] = await Promise.all([listUsersWithActivity(getDb(), { role, q, limit: PAGE_SIZE, offset: offsetFor(page) }), countUsers(getDb(), { role, q })]);
  const tab = role ?? "all";
  const href = (r: string) => `/admin/logs?${new URLSearchParams({ ...(r !== "all" ? { role: r } : {}), ...(q ? { q } : {}) })}`;
  return (
    <>
      <PageHeader title="Settings" description="Activity logs — every user and what they did." />
      <SettingsTabs current="logs" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5" role="tablist">
          {TABS.map(([k, label]) => (
            <Link key={k} href={href(k)} role="tab" aria-selected={tab === k} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-accent-soft text-accent" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>
          ))}
        </div>
        <form method="get" className="flex items-center gap-2">
          {role && <input type="hidden" name="role" value={role} />}
          <label className="relative">
            <span className="sr-only">Search users</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" aria-hidden />
            <input name="q" defaultValue={q} placeholder="Search name or email" maxLength={60} className="w-56 rounded-lg border border-line bg-white py-2 pl-8 pr-3 text-sm" />
          </label>
        </form>
      </div>
      {rows.length === 0 ? <Empty>No users found.</Empty> : (
        <Table>
          <thead><tr><Th>User</Th><Th>Status</Th><Th>Last login</Th><Th>Last activity</Th><Th className="text-right">Actions logged</Th><Th className="text-right">View</Th></tr></thead>
          <tbody>
            {rows.slice(0, PAGE_SIZE).map((u) => (
              <tr key={u.id}>
                <Td><p className="font-medium">{u.name}</p><p className="text-xs text-muted">{u.email} · <span className="capitalize">{u.role}</span></p></Td>
                <Td><Badge kind={!u.isActive ? "disabled" : u.tenantStatus === "moved_out" ? "moved_out" : "active"} /></Td>
                <Td>{when(u.lastLoginAt)}</Td>
                <Td>{when(u.last)}</Td>
                <Td className="text-right tabular-nums">{u.actions}</Td>
                <Td><RowActions><EditLink href={`/admin/logs/${u.id}`} label="View logs" /></RowActions></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={total} basePath="/admin/logs" params={{ role, q: q || undefined }} />
    </>
  );
}
