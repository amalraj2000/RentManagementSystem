CREATE TABLE `payment_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`paid_on` text NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`note` text,
	`screenshot` blob,
	`screenshot_mime` text,
	`screenshot_name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reject_reason` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`payment_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "claim_positive" CHECK("payment_claims"."amount_paise" > 0),
	CONSTRAINT "claim_shot_size" CHECK("payment_claims"."screenshot" is null or length("payment_claims"."screenshot") <= 2097152)
);
--> statement-breakpoint
CREATE INDEX `claims_tenant_idx` ON `payment_claims` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `claims_status_idx` ON `payment_claims` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `claims_invoice_idx` ON `payment_claims` (`invoice_id`);