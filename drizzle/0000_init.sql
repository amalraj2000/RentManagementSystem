CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `announcements_created_idx` ON `announcements` (`created_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`details` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `bed_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`bed_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bed_id`) REFERENCES `beds`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bed_current_uq` ON `bed_assignments` (`bed_id`) WHERE "bed_assignments"."end_date" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_current_bed_uq` ON `bed_assignments` (`tenant_id`) WHERE "bed_assignments"."end_date" is null;--> statement-breakpoint
CREATE INDEX `bed_assign_tenant_idx` ON `bed_assignments` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `beds` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`bed_number` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bed_number_range" CHECK("beds"."bed_number" between 1 and 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beds_room_number_uq` ON `beds` (`room_id`,`bed_number`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`spent_on` text NOT NULL,
	`description` text NOT NULL,
	`receipt_ref` text,
	`utility_bill_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`utility_bill_id`) REFERENCES `utility_bills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expense_positive" CHECK("expenses"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_utility_bill_id_unique` ON `expenses` (`utility_bill_id`);--> statement-breakpoint
CREATE INDEX `expenses_spent_on_idx` ON `expenses` (`spent_on`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`utility_bill_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`utility_bill_id`) REFERENCES `utility_bills`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_item_utility_uq` ON `invoice_items` (`invoice_id`,`utility_bill_id`) WHERE "invoice_items"."utility_bill_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_item_rent_uq` ON `invoice_items` (`invoice_id`) WHERE "invoice_items"."kind" = 'rent';--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`period_month` text NOT NULL,
	`due_date` text NOT NULL,
	`total_paise` integer DEFAULT 0 NOT NULL,
	`paid_paise` integer DEFAULT 0 NOT NULL,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invoice_paid_nonneg" CHECK("invoices"."paid_paise" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_tenant_period_uq` ON `invoices` (`tenant_id`,`period_month`);--> statement-breakpoint
CREATE INDEX `invoice_period_idx` ON `invoices` (`period_month`);--> statement-breakpoint
CREATE INDEX `invoice_due_idx` ON `invoices` (`due_date`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`receipt_no` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`paid_on` text NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`note` text,
	`recorded_by` text,
	`voided_at` integer,
	`void_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_positive" CHECK("payments"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_receipt_no_unique` ON `payments` (`receipt_no`);--> statement-breakpoint
CREATE INDEX `payments_invoice_idx` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `payments_tenant_idx` ON `payments` (`tenant_id`,`paid_on`);--> statement-breakpoint
CREATE INDEX `payments_paid_on_idx` ON `payments` (`paid_on`);--> statement-breakpoint
CREATE TABLE `rent_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`default_rent_paise` integer DEFAULT 0 NOT NULL,
	`due_day_of_month` integer DEFAULT 5 NOT NULL,
	`electricity_method` text DEFAULT 'equal_residents' NOT NULL,
	`water_method` text DEFAULT 'equal_residents' NOT NULL,
	`house_rules` text DEFAULT '' NOT NULL,
	`contact_info` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "rent_settings_single" CHECK("rent_settings"."id" = 1),
	CONSTRAINT "due_day_range" CHECK("rent_settings"."due_day_of_month" between 1 and 28)
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`max_occupancy` integer DEFAULT 4 NOT NULL,
	`has_attached_bathroom` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "room_capacity_range" CHECK("rooms"."max_occupancy" between 1 and 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_name_unique` ON `rooms` (`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tenant_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`phone` text NOT NULL,
	`joining_date` text NOT NULL,
	`move_out_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`monthly_rent_paise` integer NOT NULL,
	`security_deposit_paise` integer DEFAULT 0 NOT NULL,
	`emergency_contact_name` text,
	`emergency_contact_phone` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tenant_rent_nonneg" CHECK("tenant_profiles"."monthly_rent_paise" >= 0),
	CONSTRAINT "tenant_deposit_nonneg" CHECK("tenant_profiles"."security_deposit_paise" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_profiles_user_id_unique` ON `tenant_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `tenant_status_idx` ON `tenant_profiles` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE TABLE `utility_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`utility_bill_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`utility_bill_id`) REFERENCES `utility_bills`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "alloc_nonneg" CHECK("utility_allocations"."amount_paise" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alloc_bill_tenant_uq` ON `utility_allocations` (`utility_bill_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `alloc_tenant_idx` ON `utility_allocations` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `utility_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`period_month` text NOT NULL,
	`total_paise` integer NOT NULL,
	`allocation_method` text NOT NULL,
	`bill_date` text NOT NULL,
	`due_date` text NOT NULL,
	`opening_reading` integer,
	`closing_reading` integer,
	`units_consumed` integer,
	`attachment_ref` text,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "utility_total_positive" CHECK("utility_bills"."total_paise" > 0),
	CONSTRAINT "utility_readings_ok" CHECK("utility_bills"."closing_reading" is null or "utility_bills"."opening_reading" is null or "utility_bills"."closing_reading" >= "utility_bills"."opening_reading")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `utility_type_period_uq` ON `utility_bills` (`type`,`period_month`);