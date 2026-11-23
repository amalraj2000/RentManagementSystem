import Link from "next/link";
import { CalendarClock, Megaphone, Pin } from "lucide-react";
import { LiveClock } from "@/components/live-clock";
import { Badge, buttonClass, Card, Empty } from "@/components/ui";
import { getDb } from "@/db/client";
import { rentState, splitRentExpense } from "@/lib/billing";
import { currentMonth, formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireTenant } from "@/lib/session";
import { myClaims } from "@/services/claims";
import { listAnnouncements } from "@/services/misc";
import { myRentLedger, mySharedItems } from "@/services/portal";
import { categoryLabel } from "@/lib/categories";

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
  const [ledger, claims, notices, shared] = await Promise.all([myRentLedger(db, user.id, month), myClaims(db, user.id, 50), listAnnouncements(db, 5), mySharedItems(db, user.id)]);
  const inv = ledger?.months.find((m) => m.month === month)?.invoice ?? null;
  const pend = (p: "rent" | "expense") => (inv ? claims.filter((c) => c.invoiceId === inv.id && c.status === "pending" && c.purpose === p).reduce((a, c) => a + c.amountPaise, 0) : 0);
  const today = todayISO();
  const sp = inv ? splitRentExpense({ rent: inv.rentPaise, other: inv.otherPaise, adjustment: inv.adjustmentPaise }, { rent: inv.rentPaidPaise, expense: inv.expensePaidPaise }, { rent: pend("rent"), expense: pend("expense") }) : null;
  const rent = inv && sp ? { amount: sp.rentPayable, balance: sp.rentBalance, state: rentState({ totalPaise: sp.rentPayable, paidPaise: sp.rentCovered, dueDate: inv.dueDate }, sp.pendingRent, today), payable: sp.rentBalance - sp.pendingRent } : null;
  // this month's expenses, one line each (Electricity / Water / Gas cylinder) — every one is paid on its own
  const lines = inv ? shared.filter((s) => s.invoiceId === inv.id) : [];
  const lineState = (l: (typeof lines)[number]) => (l.status === "paid" ? "paid" : l.pending >= l.balance ? "waiting" : today > l.dueDate ? "overdue" : l.status === "partial" ? "partial" : "unpaid") as ReturnType<typeof rentState>;
  const exp = inv && sp && sp.expensePayable > 0 ? { amount: sp.expensePayable, balance: sp.expenseBalance, state: rentState({ totalPaise: sp.expensePayable, paidPaise: sp.expenseCovered, dueDate: inv.dueDate }, sp.pendingExpense, today), payable: sp.expenseBalance - sp.pendingExpense } : null;
  const payHref = (amount: number, note: string, purpose: "rent" | "expense") => `/portal/invoices/${inv!.id}/pay?${new URLSearchParams({ for: purpose, amount: String(amount), note })}`;
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
          <div className={`grid gap-3 ${exp ? "sm:grid-cols-2" : ""}`}>
            {card("Rent", rent, payHref(rent.payable, `For: Rent ${monthLabel(month)}`, "rent"), "rent")}
            {exp && (
              <Card className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-muted">Expenses</h3>
                  <Badge kind={exp.state} wrap />
                </div>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{formatINR(exp.amount)}</p>
                <p className="mt-1 text-xs text-muted">Due {formatDate(inv.dueDate)}{exp.state !== "paid" && exp.balance !== exp.amount ? ` · balance ${formatINR(exp.balance)}` : ""}</p>
                {lines.length > 0 && (
                  <ul className="mt-3 divide-y divide-line border-t border-line">
                    {lines.map((l) => {
                      const st = lineState(l);
                      return (
                        <li key={l.itemId} className="flex items-center gap-2 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-tight">{categoryLabel(l.category)}</p>
                            <p className="text-xs tabular-nums text-muted">{formatINR(l.amountPaise)}</p>
                          </div>
                          <Badge kind={st} wrap />
                          {st !== "paid" && st !== "waiting" && l.balance - l.pending > 0 ? (
                            <Link href={`/portal/invoices/${l.invoiceId}/pay?${new URLSearchParams({ for: "expense", item: l.itemId, amount: String(l.balance - l.pending) })}`} className="inline-flex h-8 shrink-0 items-center rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover">Pay</Link>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}
          </div>
        )}
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
