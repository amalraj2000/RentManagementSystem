import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { expenses, invoices, payments, tenantProfiles, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { monthEnd, monthStart, MONTH_RE } from "@/lib/dates";
import { monthlySummary } from "@/services/reports";
import { categoryLabel } from "@/lib/categories";

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
  const [[sum], pays, exps, invs] = await Promise.all([
    monthlySummary(db, month, month),
    db
      .select({ date: payments.paidOn, name: users.name, amount: payments.amountPaise, method: payments.method, ref: payments.reference, receipt: payments.receiptNo, period: invoices.periodMonth })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(tenantProfiles, eq(tenantProfiles.id, payments.tenantId))
      .innerJoin(users, eq(users.id, tenantProfiles.userId))
      .where(and(isNull(payments.voidedAt), gte(payments.paidOn, monthStart(month)), lte(payments.paidOn, monthEnd(month))))
      .orderBy(asc(payments.paidOn)),
    db.select().from(expenses).where(and(gte(expenses.spentOn, monthStart(month)), lte(expenses.spentOn, monthEnd(month)))).orderBy(asc(expenses.spentOn)),
    db
      .select({ name: users.name, total: invoices.totalPaise, paid: invoices.paidPaise, due: invoices.dueDate })
      .from(invoices)
      .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
      .innerJoin(users, eq(users.id, tenantProfiles.userId))
      .where(eq(invoices.periodMonth, month))
      .orderBy(asc(users.name)),
  ]);
  const L: (string | number)[][] = [
    ["PG financial report", month],
    [],
    ["SUMMARY (INR)"],
    ["Rent collected (cash)", rupees(sum.collected.rent)],
    ["Electricity collected (cash)", rupees(sum.collected.electricity)],
    ["Water collected (cash)", rupees(sum.collected.water)],
    ["Other income (cash)", rupees(sum.collected.other)],
    ["Total cash collected", rupees(sum.collected.total)],
    ["Operating expenses", rupees(sum.expenses)],
    ["Net cash", rupees(sum.net)],
    ["Invoiced (billed, not income)", rupees(sum.invoiced)],
    ["Outstanding on month's invoices", rupees(sum.outstanding)],
    [],
    ["INVOICES"], ["Tenant", "Total", "Paid", "Balance", "Due date"],
    ...invs.map((i) => [i.name, rupees(i.total), rupees(i.paid), rupees(Math.max(i.total - i.paid, 0)), i.due]),
    [],
    ["PAYMENTS RECEIVED"], ["Date", "Tenant", "For month", "Amount", "Method", "Reference", "Receipt"],
    ...pays.map((p) => [p.date, p.name, p.period, rupees(p.amount), p.method, p.ref ?? "", p.receipt]),
    [],
    ["EXPENSES"], ["Date", "Category", "Description", "Amount", "Receipt ref"],
    ...exps.map((e) => [e.spentOn, categoryLabel(e.category), e.description, rupees(e.amountPaise), e.receiptRef ?? ""]),
  ];
  const body = "﻿" + L.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pg-report-${month}.csv"`, "Cache-Control": "no-store" },
  });
}
