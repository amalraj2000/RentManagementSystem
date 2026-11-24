import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { MonthPicker } from "@/components/month-picker";
import { buttonClass, EditLink, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { deleteInvoiceAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { invoices, tenantProfiles, users } from "@/db/schema";
import { formatDate, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { monthParam, pageParam, slicePage } from "@/lib/page";

export const metadata = { title: "Rent & invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ month?: string; page?: string }> }) {
  const sp = await searchParams;
  const month = monthParam(sp.month);
  const page = pageParam(sp.page);
  const rows = await getDb()
    .select({
      id: invoices.id, name: users.name, total: invoices.totalPaise, paid: invoices.paidPaise, dueDate: invoices.dueDate,
    })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(eq(invoices.periodMonth, month))
    .orderBy(asc(users.name))
    .then((all) => all.map((x) => ({ ...x, balance: Math.max(x.total - x.paid, 0) })));
  const { items: pageRows, total: rowCount } = slicePage(rows, page);
  const sum = rows.reduce((a, r) => ({ total: a.total + r.total, due: a.due + r.balance }), { total: 0, due: 0 });
  return (
    <>
      <PageHeader
        title="Rent & bills"
        description={`${monthLabel(month)} · ${formatINR(sum.total)} billed (${formatINR(sum.due)} due)`}
        actions={
          <>
            <MonthPicker value={month} basePath="/admin/invoices" />
            <Link href={`/admin/invoices/new?month=${month}`} className={buttonClass()}><Plus className="size-4" aria-hidden /> Generate invoices</Link>
          </>
        }
      />
      {rows.length === 0 ? <Empty>No invoices for this month yet.</Empty> : (
        <Table>
          <thead><tr><Th>Tenant</Th><Th className="text-right">Amount</Th><Th>Due</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <Td><Link className="font-medium hover:underline" href={`/admin/invoices/${r.id}`}>{r.name}</Link></Td>
                <Td className="text-right tabular-nums">{formatINR(r.total)}<span className={`block text-xs ${r.balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{r.balance > 0 ? `${formatINR(r.balance)} due` : "paid"}</span></Td>
                <Td>{formatDate(r.dueDate)}</Td>
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
