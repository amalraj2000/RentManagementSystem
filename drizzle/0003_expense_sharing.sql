CREATE TABLE `expense_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "expense_alloc_positive" CHECK("expense_allocations"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_alloc_uq` ON `expense_allocations` (`expense_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `expense_alloc_tenant_idx` ON `expense_allocations` (`tenant_id`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `share_mode` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD `expense_id` text REFERENCES expenses(id);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_item_expense_uq` ON `invoice_items` (`invoice_id`,`expense_id`) WHERE "invoice_items"."expense_id" is not null;