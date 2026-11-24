import Link from "next/link";
import { CalendarClock, Megaphone, Pin } from "lucide-react";
import { LiveClock } from "@/components/live-clock";
import { Badge, buttonClass, Card } from "@/components/ui";
import { getDb } from "@/db/client";
import { rentState } from "@/lib/billing";
import { currentMonth, formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { myClaims } from "@/services/claims";
import { listAnnouncements } from "@/services/misc";
import { myRentLedger } from "@/services/portal";

export const metadata = { title: "Home" };

const ADVICE: Record<string, string> = {
  paid: "All done. Thank you!",
  waiting: "The owner will confirm your payment soon.",
  overdue: "Past the due date. Please pay as soon as you can.",
  partial: "Part paid. The rest is still due.",
  unpaid: "Please pay by the due date.",
};

export default async function PortalHome() {
  const user = await requireTenant();
  const db = getDb();
  const month = currentMonth();
  const [ledger, claims, notices] = await Promise.all([myRentLedger(db, user.id, month), myClaims(db, user.id, 50), listAnnouncements(db, 5)]);
  const inv = ledger?.months.find((m) => m.month === month)?.invoice ?? null;
  const pending = inv ? claims.filter((c) => c.invoiceId === inv.id && c.status === "pending").reduce((a, c) => a + c.amountPaise, 0) : 0;
  const today = todayISO();
  const balance = inv ? Math.max(inv.totalPaise - inv.paidPaise, 0) : 0;
  const rent = inv ? { amount: inv.totalPaise, balance, state: rentState({ totalPaise: inv.totalPaise, paidPaise: inv.paidPaise, dueDate: inv.dueDate }, Math.min(pending, balance), today), payable: Math.max(balance - pending, 0) } : null;
  const payHref = (amount: number, note: string) => `/portal/invoices/${inv!.id}/pay?${new URLSearchParams({ amount: String(amount), note })}`;
  const card = (title: string, c: NonNullable<typeof rent>, href: string, label: string) => (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-muted">{title}</h3>
        <Badge kind={c.state} wrap />
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{formatINR(c.amount)}</p>
      <p className="mt-1 text-xs text-muted">Due {formatDate(inv!.dueDate)}{c.state !== "paid" && c.balance !== c.amount ? ` · balance ${formatINR(c.balance)}` : ""}</p>
      <p className="mt-3 flex-1 text-sm text-slate-600">{ADVICE[c.state]}</p>
      {c.payable > 0 && <Link href={href} className={`${buttonClass()} mt-4 w-full`}>Pay {label}</Link>}
    </Card>
  );
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Hi, {user.name.split(" ")[0]}</h1>
        <LiveClock />
      </header>

      <section aria-labelledby="rent-now">
        <h2 id="rent-now" className="mb-2 text-sm font-semibold">{monthLabel(month)}</h2>
        {!inv || !rent ? (
          <Card className="p-5">
            <div className="flex items-center gap-3 text-sm text-muted"><CalendarClock className="size-5 shrink-0" aria-hidden />{ledger?.tenant.status === "moved_out" ? "You have vacated, so there is nothing due this month." : "This month's bill hasn't been generated yet."}</div>
          </Card>
        ) : (
          <div>
            {card("Rent", rent, payHref(rent.payable, `For: Rent ${monthLabel(month)}`), "rent")}
          </div>
        )}
      </section>

      {/* shown only when the owner has posted something */}
      {notices.length > 0 && (
      <section aria-labelledby="notices" className="mt-7">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="notices" className="text-sm font-semibold">Announcements</h2>
          <Link href="/portal/notices" className="text-sm font-medium text-accent hover:underline">See all</Link>
        </div>
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
      </section>
      )}
    </div>
  );
}
