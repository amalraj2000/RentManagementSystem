import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { buttonClass, Card, EditLink, Empty, Field, Input, PageHeader, Pager, RowActions, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { createUtilityAction, deleteUtilityAction, updateUtilityAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { utilityBills } from "@/db/schema";
import { addMonths, currentMonth, formatDate, monthEnd, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PAGE_SIZE } from "@/lib/page";
import { eligibleTenants, getSettings } from "@/services/billing";

type Type = "electricity" | "water";
const METHOD_LABEL = { equal_residents: "Equal – residents", equal_beds: "Equal – occupied beds", custom: "Custom" } as const;
const title = (t: Type) => (t === "electricity" ? "Electricity" : "Water");

export async function UtilityList({ type, page }: { type: Type; page: number }) {
  const bills = await getDb().select().from(utilityBills).where(eq(utilityBills.type, type)).orderBy(desc(utilityBills.periodMonth)).limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE);
  const isElec = type === "electricity";
  return (
    <>
      <PageHeader title={title(type)} description="Each bill is split once and saved as a snapshot. Charges appear on tenant invoices separately from rent." actions={<Link href={`/admin/${type}/new`} className={buttonClass()}><Plus className="size-4" aria-hidden /> Add {type} bill</Link>} />
      {bills.length === 0 ? <Empty>No {type} bills yet.</Empty> : (
        <Table>
          <thead><tr><Th>Period</Th><Th className="text-right">Total</Th>{isElec && <Th className="text-right">Units</Th>}<Th>Split</Th><Th>Bill date</Th><Th>Due</Th><Th className="text-right">Action</Th></tr></thead>
          <tbody>
            {bills.slice(0, PAGE_SIZE).map((b) => (
              <tr key={b.id}>
                <Td className="font-medium">{monthLabel(b.periodMonth)}</Td>
                <Td className="text-right tabular-nums">{formatINR(b.totalPaise)}</Td>
                {isElec && <Td className="text-right tabular-nums">{b.unitsConsumed ?? "—"}</Td>}
                <Td>{METHOD_LABEL[b.allocationMethod]}</Td>
                <Td>{formatDate(b.billDate)}</Td>
                <Td>{formatDate(b.dueDate)}</Td>
                <Td>
                  <RowActions>
                    <EditLink href={`/admin/${type}/${b.id}/edit`} />
                    <ConfirmButton label="Delete" title={`Delete ${monthLabel(b.periodMonth)} ${type} bill?`} body="Removes it from tenant invoices. Not allowed if payments were recorded against those invoices." action={deleteUtilityAction.bind(null, b.id)} confirmLabel="Delete" />
                  </RowActions>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} hasMore={bills.length > PAGE_SIZE} basePath={`/admin/${type}`} />
    </>
  );
}

export async function UtilityNew({ type }: { type: Type }) {
  const db = getDb();
  const month = currentMonth();
  const [settings, tenants] = await Promise.all([getSettings(db), eligibleTenants(db, month)]);
  const isElec = type === "electricity";
  return (
    <>
      <BackLink href={`/admin/${type}`} label={title(type)} />
      <PageHeader title={`Add ${type} bill`} description="Saved once and split across tenants; the split never changes afterwards." />
      <Card className="max-w-xl p-5">
        <ActionForm action={createUtilityAction.bind(null, type)} submit="Save & allocate" redirectTo={`/admin/${type}`} reset={false} className="space-y-3">
          <Field label="Billing month"><Input name="periodMonth" type="month" required defaultValue={month} /></Field>
          <Field label="Total bill (₹)"><Input name="total" inputMode="decimal" required /></Field>
          {isElec && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opening reading"><Input name="openingReading" inputMode="numeric" /></Field>
              <Field label="Closing reading"><Input name="closingReading" inputMode="numeric" /></Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bill date"><Input name="billDate" type="date" required defaultValue={monthEnd(month)} /></Field>
            <Field label="Due date"><Input name="dueDate" type="date" required defaultValue={`${addMonths(month, 1)}-10`} /></Field>
          </div>
          <Field label="Allocation method">
            <Select name="method" defaultValue={isElec ? settings.electricityMethod : settings.waterMethod}>
              <option value="equal_residents">Equal split – eligible residents</option>
              {isElec && <option value="equal_beds">Equal split – occupied beds</option>}
              <option value="custom">Custom amount per tenant</option>
            </Select>
          </Field>
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-xs font-medium text-muted">Custom amounts (₹) — only used for “Custom”; must add up to the total</legend>
            <div className="space-y-2">
              {tenants.length === 0 && <p className="text-xs text-muted">No eligible tenants for this month.</p>}
              {tenants.map((t) => (
                <label key={t.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <Input name={`custom_${t.id}`} inputMode="decimal" className="!w-28 shrink-0" aria-label={`Custom amount for ${t.name}`} />
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Bill reference / attachment link" hint="Bill number or a link to a scan. Files are not stored in this app."><Input name="attachmentRef" maxLength={300} /></Field>
          <Field label="Notes"><Textarea name="notes" maxLength={300} rows={2} /></Field>
        </ActionForm>
      </Card>
    </>
  );
}

export async function UtilityEdit({ type, id }: { type: Type; id: string }) {
  const [b] = await getDb().select().from(utilityBills).where(eq(utilityBills.id, id));
  if (!b || b.type !== type) notFound();
  return (
    <>
      <BackLink href={`/admin/${type}`} label={title(type)} />
      <PageHeader title={`Edit ${type} bill · ${monthLabel(b.periodMonth)}`} description={`Total ${formatINR(b.totalPaise)} · ${METHOD_LABEL[b.allocationMethod]}. The total and split are locked once saved — to change them, delete this bill and add it again.`} />
      <Card className="max-w-xl p-5">
        <ActionForm action={updateUtilityAction.bind(null, id)} redirectTo={`/admin/${type}`} reset={false} className="space-y-3">
          {type === "electricity" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opening reading"><Input name="openingReading" inputMode="numeric" defaultValue={b.openingReading ?? ""} /></Field>
              <Field label="Closing reading"><Input name="closingReading" inputMode="numeric" defaultValue={b.closingReading ?? ""} /></Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bill date"><Input name="billDate" type="date" required defaultValue={b.billDate} /></Field>
            <Field label="Due date"><Input name="dueDate" type="date" required defaultValue={b.dueDate} /></Field>
          </div>
          <Field label="Bill reference / attachment link"><Input name="attachmentRef" maxLength={300} defaultValue={b.attachmentRef ?? ""} /></Field>
          <Field label="Notes"><Textarea name="notes" maxLength={300} rows={2} defaultValue={b.notes ?? ""} /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
