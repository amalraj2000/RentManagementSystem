import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { MonthPicker } from "@/components/month-picker";
import { Badge, buttonClass, EditLink, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { deleteInvoiceAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { invoiceItems, invoices, tenantProfiles, users } from "@/db/schema";
import { splitRentExpense } from "@/lib/billing";
import { invoiceStatus } from "@/lib/billing";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { monthParam, pageParam, slicePage } from "@/lib/page";

export const metadata = { title: "Rent & invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ month?: string; page?: string }> }) {
  const sp = await searchParams;
  const month = monthParam(sp.month);
  const page = pageParam(sp.page);
  const rows = await getDb()
    .select({
      id: invoices.id, name: users.name, total: invoices.totalPaise, paid: invoices.paidPaise, dueDate: invoices.dueDate, cancelledAt: invoices.cancelledAt,
      rentPaid: invoices.rentPaidPaise, expensePaid: invoices.expensePaidPaise,
      rent: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'rent' then ${invoiceItems.amountPaise} else 0 end), 0)`,
      other: sql<number>`coalesce(sum(case when ${invoiceItems.kind} not in ('rent', 'adjustment') then ${invoiceItems.amountPaise} else 0 end), 0)`,
      adjustment: sql<number>`coalesce(sum(case when ${invoiceItems.kind} = 'adjustment' then ${invoiceItems.amountPaise} else 0 end), 0)`,
    })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .leftJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
    .where(eq(invoices.periodMonth, month))
    .groupBy(invoices.id, users.name)
    .orderBy(asc(users.name))
    .then((all) => all.map((x) => ({ ...x, split: splitRentExpense({ rent: Number(x.rent), other: Number(x.other), adjustment: Number(x.adjustment) }, { rent: x.rentPaid, expense: x.expensePaid }) })));
  const { items: pageRows, total: rowCount } = slicePage(rows, page);
  const today = todayISO();
  const sum = rows.reduce((a, r) => ({ rent: a.rent + r.split.rentPayable, rentDue: a.rentDue + r.split.rentBalance, exp: a.exp + r.split.expensePayable, expDue: a.expDue + r.split.expenseBalance }), { rent: 0, rentDue: 0, exp: 0, expDue: 0 });
  return (
    <>
      <PageHeader
        title="Rent & bills"
        description={`${monthLabel(month)} · Rent ${formatINR(sum.rent)} (${formatINR(sum.rentDue)} due) · Expenses ${formatINR(sum.exp)} (${formatINR(sum.expDue)} due)`}
        actions={
          <>
            <MonthPicker value={month} basePath="/admin/invoices" />
            <Link href={`/admin/invoices/new?month=${month}`} className={buttonClass()}><Plus className="size-4" aria-hidden /> Generate invoices</Link>
          </>
        }
      />
      {rows.length === 0 ? <Empty>No invoices for this month yet.</Empty> : (
        <Table>
          <thead><tr><Th>Tenant</Th><Th className="text-right">Rent</Th><Th className="text-right">Expenses</Th><Th>Due</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <Td><Link className="font-medium hover:underline" href={`/admin/invoices/${r.id}`}>{r.name}</Link></Td>
                <Td className="text-right tabular-nums">{formatINR(r.split.rentPayable)}<span className={`block text-xs ${r.split.rentBalance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{r.split.rentBalance > 0 ? `${formatINR(r.split.rentBalance)} due` : "paid"}</span></Td>
                <Td className="text-right tabular-nums">{r.split.expensePayable > 0 ? <>{formatINR(r.split.expensePayable)}<span className={`block text-xs ${r.split.expenseBalance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{r.split.expenseBalance > 0 ? `${formatINR(r.split.expenseBalance)} due` : "paid"}</span></> : <span className="text-muted">—</span>}</Td>
                <Td>{formatDate(r.dueDate)}</Td>
                <Td><Badge kind={invoiceStatus({ totalPaise: r.total, paidPaise: r.paid, dueDate: r.dueDate, cancelledAt: r.cancelledAt }, today)} /></Td>
                <Td>
                  <RowActions>
                    <EditLink href={`/admin/invoices/${r.id}`} label="Open" />
                    <ConfirmButton label="Delete" title="Delete this invoice?" body="Only possible when no payment was ever recorded. You can regenerate it afterwards." action={deleteInvoiceAction.bind(null, r.id)} confirmLabel="Delete" />
                  </RowActions>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} total={rowCount} basePath="/admin/invoices" params={{ month }} />
    </>
  );
}
