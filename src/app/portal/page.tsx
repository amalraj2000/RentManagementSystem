import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { getDb } from "@/db/client";
import { invoiceStatus, balanceOf } from "@/lib/billing";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { listAnnouncements } from "@/services/misc";
import { myInvoices, tenantForUser } from "@/services/portal";

export const metadata = { title: "Home" };

export default async function PortalHome() {
  const user = await requireTenant();
  const db = getDb();
  const [me, invs, notices] = await Promise.all([tenantForUser(db, user.id), myInvoices(db, user.id, 12), listAnnouncements(db, 3)]);
  const today = todayISO();
  const open = invs.filter((i) => balanceOf(i) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const due = open.reduce((a, i) => a + balanceOf(i), 0);
  const overdue = open.filter((i) => invoiceStatus(i, today) === "overdue");
  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(" ")[0]}`} description={me?.roomName ? `${me.roomName} · Bed ${me.bedNumber}` : undefined} />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Amount due" value={formatINR(due)} tone={overdue.length ? "warn" : due ? undefined : "good"} hint={due === 0 ? "You're all settled" : overdue.length ? `${overdue.length} overdue` : `Next due ${formatDate(open[0]?.dueDate)}`} />
        <Stat label="Monthly rent" value={formatINR(me?.monthlyRentPaise ?? 0)} />
      </div>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Open bills</h2>
      {open.length === 0 ? <Card><Empty>No pending bills 🎉</Empty></Card> : (
        <ul className="space-y-2">
          {open.map((i) => (
            <li key={i.id}>
              <Link href={`/portal/invoices/${i.id}`} className="flex items-center justify-between rounded-xl border border-line bg-white p-4 hover:border-accent">
                <div><p className="font-medium">{monthLabel(i.periodMonth)}</p><p className="text-xs text-muted">Due {formatDate(i.dueDate)}</p></div>
                <div className="text-right"><p className="font-semibold tabular-nums">{formatINR(balanceOf(i))}</p><Badge kind={invoiceStatus(i, today)} /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mb-2 mt-6 text-sm font-semibold">Latest notices</h2>
      {notices.length === 0 ? <Card><Empty>No notices.</Empty></Card> : (
        <div className="space-y-2">
          {notices.map((n) => <Card key={n.id} className="p-4"><p className="text-sm font-semibold">{n.title}</p><p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-700">{n.body}</p></Card>)}
          <Link href="/portal/notices" className="text-sm font-medium text-accent hover:underline">All notices →</Link>
        </div>
      )}
    </>
  );
}
