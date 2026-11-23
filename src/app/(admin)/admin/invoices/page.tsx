import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { ConfirmButton } from "@/components/action-form";
import { MonthPicker } from "@/components/month-picker";
import { Badge, buttonClass, EditLink, Empty, PageHeader, Pager, RowActions, Table, Td, Th } from "@/components/ui";
import { deleteInvoiceAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { invoices, tenantProfiles, users } from "@/db/schema";
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
    .select({ id: invoices.id, name: users.name, total: invoices.totalPaise, paid: invoices.paidPaise, dueDate: invoices.dueDate, cancelledAt: invoices.cancelledAt })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(eq(invoices.periodMonth, month))
    .orderBy(asc(users.name));
  const { items: pageRows, total: rowCount } = slicePage(rows, page);
  const today = todayISO();
  const sum = rows.reduce((a, r) => ({ total: a.total + r.total, paid: a.paid + r.paid }), { total: 0, paid: 0 });
  return (
    <>
      <PageHeader
        title="Rent & invoices"
        description={`${monthLabel(month)} · billed ${formatINR(sum.total)} · collected ${formatINR(sum.paid)} · pending ${formatINR(sum.total - sum.paid)}`}
        actions={
          <>
            <MonthPicker value={month} basePath="/admin/invoices" />
            <Link href={`/admin/invoices/new?month=${month}`} className={buttonClass()}><Plus className="size-4" aria-hidden /> Generate invoices</Link>
          </>
        }
      />
      {rows.length === 0 ? <Empty>No invoices for this month yet.</Empty> : (
        <Table>
          <thead><tr><Th>Tenant</Th><Th className="text-right">Total</Th><Th className="text-right">Paid</Th><Th className="text-right">Balance</Th><Th>Due</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <Td><Link className="font-medium hover:underline" href={`/admin/invoices/${r.id}`}>{r.name}</Link></Td>
                <Td className="text-right tabular-nums">{formatINR(r.total)}</Td>
                <Td className="text-right tabular-nums">{formatINR(r.paid)}</Td>
                <Td className="text-right tabular-nums">{formatINR(Math.max(r.total - r.paid, 0))}</Td>
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
