CREATE TABLE `expense_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`status` text DEFAULT 'due' NOT NULL,
	`method` text,
	`paid_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "expense_share_positive" CHECK("expense_shares"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_share_uq` ON `expense_shares` (`expense_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `expense_share_tenant_idx` ON `expense_shares` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`amount_paise` integer NOT NULL,
	`expense_date` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "expense_amount_positive" CHECK("expenses"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`expense_date`);