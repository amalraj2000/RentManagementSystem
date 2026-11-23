import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { auditLogs, invoiceItems, invoices, payments } from "@/db/schema";

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Q = DB | Tx;

/** Errors safe to show to users. Anything else is masked as a generic failure. */
export class AppError extends Error {}

export async function audit(q: Q, actorId: string | null, action: string, entity: string, entityId?: string | null, details?: unknown) {
  await q.insert(auditLogs).values({
    actorId,
    action,
    entity,
    entityId: entityId ?? null,
    details: details === undefined ? null : JSON.stringify(details).slice(0, 2000),
  });
}

/** Recompute denormalised invoice totals from items and non-voided payments. */
export async function recomputeInvoice(q: Q, invoiceId: string) {
  const [t] = await q
    .select({ total: sql<number>`coalesce(sum(${invoiceItems.amountPaise}), 0)` })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId));
  const [p] = await q
    .select({ paid: sql<number>`coalesce(sum(case when ${payments.voidedAt} is null then ${payments.amountPaise} else 0 end), 0)` })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  await q.update(invoices).set({ totalPaise: Number(t.total), paidPaise: Number(p.paid) }).where(eq(invoices.id, invoiceId));
}
