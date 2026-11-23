import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

/** All money columns are integer paise (INR * 100). Dates are ISO text: YYYY-MM-DD; months: YYYY-MM. */

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: text("role", { enum: ["admin", "tenant"] }).notNull(),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

export const tenantProfiles = sqliteTable(
  "tenant_profiles",
  {
    id: id(),
    userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "restrict" }),
    phone: text("phone").notNull(),
    joiningDate: text("joining_date").notNull(),
    moveOutDate: text("move_out_date"),
    status: text("status", { enum: ["active", "notice", "moved_out"] }).notNull().default("active"),
    monthlyRentPaise: integer("monthly_rent_paise").notNull(),
    securityDepositPaise: integer("security_deposit_paise").notNull().default(0),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tenant_status_idx").on(t.status),
    check("tenant_rent_nonneg", sql`${t.monthlyRentPaise} >= 0`),
    check("tenant_deposit_nonneg", sql`${t.securityDepositPaise} >= 0`),
  ],
);

export const rooms = sqliteTable(
  "rooms",
  {
    id: id(),
    name: text("name").notNull().unique(),
    maxOccupancy: integer("max_occupancy").notNull().default(4),
    hasAttachedBathroom: integer("has_attached_bathroom", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("room_capacity_range", sql`${t.maxOccupancy} between 1 and 4`)],
);

export const beds = sqliteTable(
  "beds",
  {
    id: id(),
    roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "restrict" }),
    bedNumber: integer("bed_number").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("beds_room_number_uq").on(t.roomId, t.bedNumber),
    check("bed_number_range", sql`${t.bedNumber} between 1 and 4`),
  ],
);

export const bedAssignments = sqliteTable(
  "bed_assignments",
  {
    id: id(),
    bedId: text("bed_id").notNull().references(() => beds.id, { onDelete: "restrict" }),
    tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id, { onDelete: "restrict" }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    createdAt: createdAt(),
  },
  (t) => [
    // A bed can have only one current occupant; a tenant only one current bed.
    uniqueIndex("bed_current_uq").on(t.bedId).where(sql`${t.endDate} is null`),
    uniqueIndex("tenant_current_bed_uq").on(t.tenantId).where(sql`${t.endDate} is null`),
    index("bed_assign_tenant_idx").on(t.tenantId),
  ],
);

export const rentSettings = sqliteTable(
  "rent_settings",
  {
    id: integer("id").primaryKey(), // always 1
    defaultRentPaise: integer("default_rent_paise").notNull().default(0),
    dueDayOfMonth: integer("due_day_of_month").notNull().default(5),
    electricityMethod: text("electricity_method", { enum: ["equal_residents", "equal_beds", "custom"] })
      .notNull()
      .default("equal_residents"),
    waterMethod: text("water_method", { enum: ["equal_residents", "custom"] }).notNull().default("equal_residents"),
    houseRules: text("house_rules").notNull().default(""),
    contactInfo: text("contact_info").notNull().default(""),
    updatedAt: updatedAt(),
  },
  (t) => [check("rent_settings_single", sql`${t.id} = 1`), check("due_day_range", sql`${t.dueDayOfMonth} between 1 and 28`)],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id, { onDelete: "restrict" }),
    periodMonth: text("period_month").notNull(),
    dueDate: text("due_date").notNull(),
    /** Denormalised from invoice_items / payments; maintained inside the same transaction as every write. */
    totalPaise: integer("total_paise").notNull().default(0),
    paidPaise: integer("paid_paise").notNull().default(0),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("invoice_tenant_period_uq").on(t.tenantId, t.periodMonth),
    index("invoice_period_idx").on(t.periodMonth),
    index("invoice_due_idx").on(t.dueDate),
    check("invoice_paid_nonneg", sql`${t.paidPaise} >= 0`),
  ],
);

export const invoiceItems = sqliteTable(
  "invoice_items",
  {
    id: id(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["rent", "electricity", "water", "other", "adjustment"] }).notNull(),
    description: text("description").notNull(),
    /** Negative for discounts/adjustments. */
    amountPaise: integer("amount_paise").notNull(),
    utilityBillId: text("utility_bill_id").references(() => utilityBills.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("invoice_items_invoice_idx").on(t.invoiceId),
    uniqueIndex("invoice_item_utility_uq").on(t.invoiceId, t.utilityBillId).where(sql`${t.utilityBillId} is not null`),
    uniqueIndex("invoice_item_rent_uq").on(t.invoiceId).where(sql`${t.kind} = 'rent'`),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id, { onDelete: "restrict" }),
    receiptNo: text("receipt_no").notNull().unique(),
    amountPaise: integer("amount_paise").notNull(),
    paidOn: text("paid_on").notNull(),
    method: text("method", { enum: ["cash", "upi", "bank_transfer", "other"] }).notNull(),
    reference: text("reference"),
    note: text("note"),
    recordedBy: text("recorded_by").references(() => users.id),
    voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_tenant_idx").on(t.tenantId, t.paidOn),
    index("payments_paid_on_idx").on(t.paidOn),
    check("payment_positive", sql`${t.amountPaise} > 0`),
  ],
);

export const utilityBills = sqliteTable(
  "utility_bills",
  {
    id: id(),
    type: text("type", { enum: ["electricity", "water"] }).notNull(),
    periodMonth: text("period_month").notNull(),
    totalPaise: integer("total_paise").notNull(),
    allocationMethod: text("allocation_method", { enum: ["equal_residents", "equal_beds", "custom"] }).notNull(),
    billDate: text("bill_date").notNull(),
    dueDate: text("due_date").notNull(),
    openingReading: integer("opening_reading"),
    closingReading: integer("closing_reading"),
    unitsConsumed: integer("units_consumed"),
    attachmentRef: text("attachment_ref"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("utility_type_period_uq").on(t.type, t.periodMonth),
    check("utility_total_positive", sql`${t.totalPaise} > 0`),
    check("utility_readings_ok", sql`${t.closingReading} is null or ${t.openingReading} is null or ${t.closingReading} >= ${t.openingReading}`),
  ],
);

export const utilityAllocations = sqliteTable(
  "utility_allocations",
  {
    id: id(),
    utilityBillId: text("utility_bill_id").notNull().references(() => utilityBills.id, { onDelete: "restrict" }),
    tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id, { onDelete: "restrict" }),
    amountPaise: integer("amount_paise").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("alloc_bill_tenant_uq").on(t.utilityBillId, t.tenantId),
    index("alloc_tenant_idx").on(t.tenantId),
    check("alloc_nonneg", sql`${t.amountPaise} >= 0`),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: id(),
    category: text("category", {
      enum: ["electricity", "water", "cleaning", "repairs", "internet", "other"],
    }).notNull(),
    amountPaise: integer("amount_paise").notNull(),
    spentOn: text("spent_on").notNull(),
    description: text("description").notNull(),
    receiptRef: text("receipt_ref"),
    /** Auto-created expense mirroring a utility bill (so it is never double counted). */
    utilityBillId: text("utility_bill_id").unique().references(() => utilityBills.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("expenses_spent_on_idx").on(t.spentOn), check("expense_positive", sql`${t.amountPaise} > 0`)],
);

export const announcements = sqliteTable(
  "announcements",
  {
    id: id(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("announcements_created_idx").on(t.createdAt)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the opaque cookie token; the raw token is never stored. */
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: text("details"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_entity_idx").on(t.entity, t.entityId)],
);

export type User = typeof users.$inferSelect;
export type TenantProfile = typeof tenantProfiles.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
