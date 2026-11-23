import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { MonthPicker } from "@/components/month-picker";
import { Badge, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { generateInvoicesAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { invoices, tenantProfiles, users } from "@/db/schema";
import { invoiceStatus } from "@/lib/billing";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { monthParam } from "@/lib/page";

export const metadata = { title: "Rent & invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = monthParam((await searchParams).month);
  const rows = await getDb()
    .select({ id: invoices.id, name: users.name, total: invoices.totalPaise, paid: invoices.paidPaise, dueDate: invoices.dueDate, cancelledAt: invoices.cancelledAt })
    .from(invoices)
    .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoices.tenantId))
    .innerJoin(users, eq(users.id, tenantProfiles.userId))
    .where(eq(invoices.periodMonth, month))
    .orderBy(asc(users.name));
  const today = todayISO();
  const sum = rows.reduce((a, r) => ({ total: a.total + r.total, paid: a.paid + r.paid }), { total: 0, paid: 0 });
  return (
    <>
      <PageHeader
        title="Rent & invoices"
        description={`${monthLabel(month)} · billed ${formatINR(sum.total)} · collected ${formatINR(sum.paid)} · pending ${formatINR(sum.total - sum.paid)}`}
        actions={<MonthPicker value={month} basePath="/admin/invoices" />}
      />
      <ActionForm action={generateInvoicesAction} submit="Generate invoices" reset={false} className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 [&>button]:mt-0">
        <input type="hidden" name="month" value={month} />
        <p className="text-sm text-muted">Creates a rent invoice for every eligible resident for {monthLabel(month)}. Safe to run again — existing invoices are never duplicated.</p>
      </ActionForm>
      {rows.length === 0 ? <Empty>No invoices for this month yet.</Empty> : (
        <Table>
          <thead><tr><Th>Tenant</Th><Th>Total</Th><Th>Paid</Th><Th>Balance</Th><Th>Due</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td><Link className="font-medium hover:underline" href={`/admin/invoices/${r.id}`}>{r.name}</Link></Td>
                <Td className="tabular-nums">{formatINR(r.total)}</Td>
                <Td className="tabular-nums">{formatINR(r.paid)}</Td>
                <Td className="tabular-nums">{formatINR(Math.max(r.total - r.paid, 0))}</Td>
                <Td>{formatDate(r.dueDate)}</Td>
                <Td><Badge kind={invoiceStatus({ totalPaise: r.total, paidPaise: r.paid, dueDate: r.dueDate, cancelledAt: r.cancelledAt }, today)} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
