import Link from "next/link";
import { CalendarClock, Megaphone, Pin } from "lucide-react";
import { LiveClock } from "@/components/live-clock";
import { Badge, buttonClass, Card, Empty } from "@/components/ui";
import { getDb } from "@/db/client";
import { balanceOf, rentState } from "@/lib/billing";
import { currentMonth, formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { myClaims } from "@/services/claims";
import { listAnnouncements } from "@/services/misc";
import { myRentLedger } from "@/services/portal";

export const metadata = { title: "Home" };

const ADVICE: Record<string, string> = {
  paid: "All done for this month. Thank you!",
  waiting: "The owner will confirm your payment soon.",
  overdue: "This is past the due date. Please pay as soon as you can.",
  partial: "You've paid part of it. The rest is still due.",
  unpaid: "Please pay by the due date.",
};

export default async function PortalHome() {
  const user = await requireTenant();
  const db = getDb();
  const month = currentMonth();
  const [ledger, claims, notices] = await Promise.all([myRentLedger(db, user.id, month), myClaims(db, user.id, 50), listAnnouncements(db, 5)]);
  const inv = ledger?.months.find((m) => m.month === month)?.invoice ?? null;
  const pending = inv ? claims.filter((c) => c.invoiceId === inv.id && c.status === "pending").reduce((a, c) => a + c.amountPaise, 0) : 0;
  const state = inv ? rentState(inv, pending, todayISO()) : null;
  const canPay = inv && balanceOf(inv) - pending > 0;
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Hi, {user.name.split(" ")[0]}</h1>
        <LiveClock />
      </header>

      <section aria-labelledby="rent-now">
        <h2 id="rent-now" className="mb-2 text-sm font-semibold">{monthLabel(month)} rent</h2>
        <Card className="p-5">
          {!inv || !state ? (
            <div className="flex items-center gap-3 text-sm text-muted"><CalendarClock className="size-5 shrink-0" aria-hidden />{ledger?.tenant.status === "moved_out" ? "You have vacated, so there is no rent for this month." : "This month's bill hasn't been generated yet."}</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-3xl font-semibold tabular-nums">{formatINR(inv.totalPaise)}</p>
                  <p className="mt-1 text-xs text-muted">Due {formatDate(inv.dueDate)}{state !== "paid" && balanceOf(inv) !== inv.totalPaise ? ` · balance ${formatINR(balanceOf(inv))}` : ""}</p>
                </div>
                <Badge kind={state} wrap />
              </div>
              <p className="mt-3 text-sm text-slate-600">{ADVICE[state]}</p>
              {canPay && <Link href={`/portal/invoices/${inv.id}/pay`} className={`${buttonClass()} mt-4 w-full sm:w-auto`}>Pay now</Link>}
            </>
          )}
        </Card>
      </section>

      <section aria-labelledby="notices" className="mt-7">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="notices" className="text-sm font-semibold">Announcements</h2>
          {notices.length > 0 && <Link href="/portal/notices" className="text-sm font-medium text-accent hover:underline">See all</Link>}
        </div>
        {notices.length === 0 ? <Card><Empty>No announcements.</Empty></Card> : (
          <ul className="space-y-2">
            {notices.map((n) => (
              <li key={n.id}>
                <Card className="p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {n.pinned ? <Pin className="size-3.5 shrink-0 text-accent" aria-label="Pinned" /> : <Megaphone className="size-3.5 shrink-0 text-muted" aria-hidden />}
                    {n.title}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{n.body}</p>
                  <p className="mt-2 text-xs text-muted">{n.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
