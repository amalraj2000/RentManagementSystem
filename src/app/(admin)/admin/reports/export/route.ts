import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { invoices, payments, tenantProfiles, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { monthEnd, monthStart, MONTH_RE } from "@/lib/dates";
import { invoiceBalances, monthlySummary } from "@/services/reports";

export const dynamic = "force-dynamic";

// Neutralise spreadsheet formula injection and quote per RFC 4180.
const cell = (v: string | number) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const rupees = (p: number) => (p / 100).toFixed(2);

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return new Response("Forbidden", { status: 403 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!MONTH_RE.test(month)) return new Response("Invalid month", { status: 400 });
  const db = getDb();
  const [[sum], pays, invs] = await Promise.all([
    monthlySummary(db, month, month),
    db
      .select({ date: payments.paidOn, name: users.name, amount: payments.amountPaise, method: payments.method, ref: payments.reference, receipt: payments.receiptNo, period: invoices.periodMonth })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(tenantProfiles, eq(tenantProfiles.id, payments.tenantId))
      .innerJoin(users, eq(users.id, tenantProfiles.userId))
      .where(and(isNull(payments.voidedAt), gte(payments.paidOn, monthStart(month)), lte(payments.paidOn, monthEnd(month))))
      .orderBy(asc(payments.paidOn)),
    invoiceBalances(db, eq(invoices.periodMonth, month)).then((all) => all.sort((a, b) => a.name.localeCompare(b.name))),
  ]);
  const L: (string | number)[][] = [
    ["PG financial report", month],
    [],
    ["SUMMARY (INR)"],
    ["Total cash collected", rupees(sum.collected)],
    ["Billed (not income)", rupees(invs.reduce((a, i) => a + i.totalPaise, 0))],
    ["Still unpaid", rupees(invs.reduce((a, i) => a + i.balance, 0))],
    [],
    ["INVOICES"], ["Tenant", "Billed", "Paid", "Due", "Due date"],
    ...invs.map((i) => [i.name, rupees(i.totalPaise), rupees(i.paidPaise), rupees(i.balance), i.dueDate]),
    [],
    ["PAYMENTS RECEIVED"], ["Date", "Tenant", "For month", "Amount", "Method", "Reference", "Receipt"],
    ...pays.map((p) => [p.date, p.name, p.period, rupees(p.amount), p.method, p.ref ?? "", p.receipt]),
  ];
  const body = "﻿" + L.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pg-report-${month}.csv"`, "Cache-Control": "no-store" },
  });
}
