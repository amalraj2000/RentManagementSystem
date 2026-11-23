import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { Badge, Card, Empty, PageHeader, Pager, Table, Td, Th } from "@/components/ui";
import { getDb } from "@/db/client";
import { offsetFor, PAGE_SIZE, pageParam } from "@/lib/page";
import { requireAdmin } from "@/lib/session";
import { actionLabel, CATEGORIES, countUserLogs, describeDetails, getLoggedUser, userLogs, type Category } from "@/services/logs";

export const metadata = { title: "User logs" };

const when = (d: Date | null) => d?.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }) ?? "Never";

export default async function UserLogsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; scope?: string; cat?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const user = await getLoggedUser(db, id);
  if (!user) notFound();
  const scope = sp.scope === "about" ? "about" : "by";
  const category = (CATEGORIES.map((c) => c[0]) as string[]).includes(sp.cat ?? "") ? (sp.cat as Category) : "all";
  const page = pageParam(sp.page);
  const who = { id: user.id, tenantId: user.tenantId };
  const [rows, total] = await Promise.all([userLogs(db, who, { scope, category, limit: PAGE_SIZE, offset: offsetFor(page) }), countUserLogs(db, who, { scope, category })]);
  const link = (over: Record<string, string>) => `/admin/logs/${id}?${new URLSearchParams({ scope, cat: category, ...over })}`;
  return (
    <>
      <BackLink href="/admin/logs" label="Logs" />
      <PageHeader title={user.name} description={`${user.email} · ${user.role === "admin" ? "Admin" : "Tenant"}`} actions={<Badge kind={!user.isActive ? "disabled" : user.tenantStatus === "moved_out" ? "moved_out" : "active"} />} />
      <Card className="mb-4 grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-muted">Last login</p><p className="font-medium">{when(user.lastLoginAt)}</p></div>
        <div><p className="text-xs text-muted">Devices logged in now</p><p className="font-medium">{user.activeSessions}</p></div>
        <div><p className="text-xs text-muted">Account created</p><p className="font-medium">{when(user.createdAt)}</p></div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5" role="tablist">
          {([["by", "Done by this user"], ["about", "Done to this account"]] as const).map(([k, label]) => (
            <Link key={k} href={link({ scope: k, page: "1" })} role="tab" aria-selected={scope === k} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${scope === k ? "bg-accent-soft text-accent" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Filter by type">
          {CATEGORIES.map(([k, label]) => (
            <Link key={k} href={link({ cat: k, page: "1" })} aria-current={category === k ? "true" : undefined} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${category === k ? "bg-ink text-white ring-ink" : "bg-white text-slate-600 ring-line hover:bg-slate-50"}`}>{label}</Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? <Card><Empty>No activity recorded{category !== "all" ? " for this filter" : ""}.</Empty></Card> : (
        <Table>
          <thead><tr><Th>When</Th><Th>What</Th><Th>Details</Th>{scope === "about" && <Th>By</Th>}</tr></thead>
          <tbody>
            {rows.slice(0, PAGE_SIZE).map((r) => {
              const failed = r.action.includes("failed") || r.action.includes("blocked");
              return (
                <tr key={r.id}>
                  <Td className="text-muted">{when(r.at)}</Td>
                  <Td><span className={`font-medium ${failed ? "text-red-700" : ""}`}>{actionLabel(r.action)}</span><span className="block font-mono text-[11px] text-muted">{r.action}</span></Td>
                  <Td className="!whitespace-normal">
                    {describeDetails(r.details).length === 0 ? <span className="text-muted">—</span> : (
                      <ul className="space-y-0.5 text-xs">{describeDetails(r.details).map((d) => <li key={d.k}><span className="text-muted">{d.k}:</span> {d.v}</li>)}</ul>
                    )}
                  </Td>
                  {scope === "about" && <Td>{r.actorName ?? <span className="text-muted">System</span>}</Td>}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={total} basePath={`/admin/logs/${id}`} params={{ scope, cat: category }} />
    </>
  );
}
