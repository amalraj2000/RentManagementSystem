import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { Card, Empty, Field, Input, PageHeader, Pager, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { createUtilityAction, deleteUtilityAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { utilityBills } from "@/db/schema";
import { addMonths, currentMonth, formatDate, monthEnd, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PAGE_SIZE } from "@/lib/page";
import { getSettings, eligibleTenants } from "@/services/billing";

const METHOD_LABEL = { equal_residents: "Equal – residents", equal_beds: "Equal – occupied beds", custom: "Custom" } as const;

export async function UtilityPage({ type, page }: { type: "electricity" | "water"; page: number }) {
  const db = getDb();
  const month = addMonths(currentMonth(), 0);
  const [settings, bills, tenants] = await Promise.all([
    getSettings(db),
    db.select().from(utilityBills).where(eq(utilityBills.type, type)).orderBy(desc(utilityBills.periodMonth)).limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE),
    eligibleTenants(db, month),
  ]);
  const isElec = type === "electricity";
  const defaultMethod = isElec ? settings.electricityMethod : settings.waterMethod;
  const action = createUtilityAction.bind(null, type);
  const title = isElec ? "Electricity" : "Water";
  return (
    <>
      <PageHeader title={title} description="Each bill is split once and saved as a snapshot. Charges appear on tenant invoices separately from rent." />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div>
          {bills.length === 0 ? <Card><Empty>No {type} bills yet.</Empty></Card> : (
            <Table>
              <thead><tr><Th>Period</Th><Th>Total</Th>{isElec && <Th>Units</Th>}<Th>Split</Th><Th>Due</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {bills.slice(0, PAGE_SIZE).map((b) => (
                  <tr key={b.id}>
                    <Td className="font-medium">{monthLabel(b.periodMonth)}</Td>
                    <Td className="tabular-nums">{formatINR(b.totalPaise)}</Td>
                    {isElec && <Td className="tabular-nums">{b.unitsConsumed ?? "—"}</Td>}
                    <Td>{METHOD_LABEL[b.allocationMethod]}</Td>
                    <Td>{formatDate(b.dueDate)}</Td>
                    <Td><ConfirmButton label="Delete" title={`Delete ${monthLabel(b.periodMonth)} ${type} bill?`} body="Removes it from tenant invoices. Not allowed if payments were recorded against those invoices." action={deleteUtilityAction.bind(null, b.id)} confirmLabel="Delete" /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pager page={page} hasMore={bills.length > PAGE_SIZE} basePath={`/admin/${type}`} />
        </div>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Add {type} bill</h2>
          <ActionForm action={action} submit="Save & allocate" className="space-y-3">
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
              <Select name="method" defaultValue={defaultMethod}>
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
                    <span className="truncate">{t.name}</span>
                    <Input name={`custom_${t.id}`} inputMode="decimal" className="w-28" aria-label={`Custom amount for ${t.name}`} />
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Bill reference / attachment link" hint="Link to a scan or the bill number. Files are not stored in this app."><Input name="attachmentRef" maxLength={300} /></Field>
            <Field label="Notes"><Textarea name="notes" maxLength={300} rows={2} /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
