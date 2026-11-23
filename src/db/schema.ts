import { sql } from "drizzle-orm";
import { blob, check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    /** Optional mobile number (shown on the admin's own profile). */
    phone: text("phone"),
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

/** Profile photo for a login user (used by admins; tenants keep theirs in tenant_documents). Private: served only to the owner and admins. */
export const userPhotos = sqliteTable(
  "user_photos",
  {
    userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [check("user_photo_size", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 2097152`)],
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

/** Private files (photo, ID proofs). Stored in the DB so nothing needs a public URL; served only via the auth-checked /api/documents/[id] route. */
export const tenantDocuments = sqliteTable(
  "tenant_documents",
  {
    id: id(),
    tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["photo", "id_proof"] }).notNull(),
    /** For ID proofs: aadhaar, pan, voter, driving_licence, passport, college_id, other */
    idType: text("id_type"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("tenant_docs_tenant_idx").on(t.tenantId),
    // At most one profile photo per tenant (replacing = delete + insert in one transaction).
    uniqueIndex("tenant_photo_uq").on(t.tenantId).where(sql`${t.kind} = 'photo'`),
    check("doc_size_range", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 2097152`),
  ],
);

/** Photos for the PUBLIC landing page. Served without login by /api/site-photos/[id]; only owner-chosen images go here. */
export const sitePhotos = sqliteTable(
  "site_photos",
  {
    id: id(),
    caption: text("caption").notNull().default(""),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("site_photos_order_idx").on(t.sortOrder, t.createdAt), check("site_photo_size", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 2097152`)],
);

export const rooms = sqliteTable(
  "rooms",
  {
    id: id(),
    name: text("name").notNull().unique(),
    maxOccupancy: integer("max_occupancy").notNull().default(4),
    hasAttachedBathroom: integer("has_attached_bathroom", { mode: "boolean" }).notNull().default(true),
    /** Set when an owner "removes" a room that has history: hidden from lists/capacity, but bed history is kept. */
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
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
    // Public landing page (intentionally public — the owner chooses what to show)
    pgName: text("pg_name").notNull().default("Our PG"),
    tagline: text("tagline").notNull().default(""),
    about: text("about").notNull().default(""),
    address: text("address").notNull().default(""),
    contactPhone: text("contact_phone").notNull().default(""),
    whatsapp: text("whatsapp").notNull().default(""),
    contactEmail: text("contact_email").notNull().default(""),
    mapsLink: text("maps_link").notNull().default(""),
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
    /** paid_paise split by what the money was FOR (rent vs expenses); always rent_paid + expense_paid = paid. Maintained with every payment change. */
    rentPaidPaise: integer("rent_paid_paise").notNull().default(0),
    expensePaidPaise: integer("expense_paid_paise").notNull().default(0),
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
    expenseId: text("expense_id").references(() => expenses.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("invoice_items_invoice_idx").on(t.invoiceId),
    uniqueIndex("invoice_item_expense_uq").on(t.invoiceId, t.expenseId).where(sql`${t.expenseId} is not null`),
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
    /** What this payment is for. Rent and expenses are paid (and tracked) separately. */
    purpose: text("purpose", { enum: ["rent", "expense"] }).notNull().default("rent"),
    /** For an expense payment: the one expense line (invoice item) it pays. Null = general, spread over the expense lines. No FK on purpose. */
    invoiceItemId: text("invoice_item_id"),
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

/** A payment the TENANT says they made. It is NOT money received until an admin approves it (which creates a real `payments` row). */
export const paymentClaims = sqliteTable(
  "payment_claims",
  {
    id: id(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id, { onDelete: "restrict" }),
    amountPaise: integer("amount_paise").notNull(),
    purpose: text("purpose", { enum: ["rent", "expense"] }).notNull().default("rent"),
    /** The one expense line this report is for (null = rent / general). */
    invoiceItemId: text("invoice_item_id"),
    paidOn: text("paid_on").notNull(),
    method: text("method", { enum: ["cash", "upi", "bank_transfer", "other"] }).notNull(),
    reference: text("reference"),
    note: text("note"),
    screenshot: blob("screenshot", { mode: "buffer" }),
    screenshotMime: text("screenshot_mime"),
    screenshotName: text("screenshot_name"),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    rejectReason: text("reject_reason"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    paymentId: text("payment_id").references(() => payments.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("claims_tenant_idx").on(t.tenantId, t.createdAt),
    index("claims_status_idx").on(t.status, t.createdAt),
    index("claims_invoice_idx").on(t.invoiceId),
    check("claim_positive", sql`${t.amountPaise} > 0`),
    check("claim_shot_size", sql`${t.screenshot} is null or length(${t.screenshot}) <= 2097152`),
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
      enum: ["electricity", "water", "cooking_gas"],
    }).notNull(),
    amountPaise: integer("amount_paise").notNull(),
    spentOn: text("spent_on").notNull(),
    description: text("description").notNull(),
    receiptRef: text("receipt_ref"),
    /** none = owner's own cost; equal/custom = also billed to tenants (see expense_allocations). */
    shareMode: text("share_mode", { enum: ["none", "equal", "custom"] }).notNull().default("none"),
    /** Auto-created expense mirroring a utility bill (so it is never double counted). */
    utilityBillId: text("utility_bill_id").unique().references(() => utilityBills.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("expenses_spent_on_idx").on(t.spentOn), check("expense_positive", sql`${t.amountPaise} > 0`)],
);

/** Each tenant's share of a shared expense — a snapshot, like utility_allocations. */
export const expenseAllocations = sqliteTable(
  "expense_allocations",
  {
    id: id(),
    expenseId: text("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id, { onDelete: "restrict" }),
    amountPaise: integer("amount_paise").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("expense_alloc_uq").on(t.expenseId, t.tenantId),
    index("expense_alloc_tenant_idx").on(t.tenantId),
    check("expense_alloc_positive", sql`${t.amountPaise} > 0`),
  ],
);

/** Optional receipt image for an expense. Kept out of `expenses` so list queries never load image bytes. Admin-only via /api/receipts/[id]. */
export const expenseReceipts = sqliteTable(
  "expense_receipts",
  {
    id: id(),
    expenseId: text("expense_id").notNull().unique().references(() => expenses.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("receipt_size_range", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 2097152`)],
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
    /** Set when an admin is viewing the app AS this user (read-only, short-lived). */
    impersonatedBy: text("impersonated_by").references(() => users.id, { onDelete: "cascade" }),
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

/** In-app notifications. `dedupeKey` makes event hooks and the daily reminder job idempotent per user. */
export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    dedupeKey: text("dedupe_key"),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("notif_user_idx").on(t.userId, t.readAt, t.createdAt),
    uniqueIndex("notif_dedupe_uq").on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

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
