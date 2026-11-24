-- Remove the Expenses feature and water/electricity utility billing.
-- 1) Data cleanup: drop expense-purpose payments/reports and every expense/utility invoice line, then recompute invoice totals.
DELETE FROM `payment_claims` WHERE `purpose` = 'expense';--> statement-breakpoint
DELETE FROM `payments` WHERE `purpose` = 'expense';--> statement-breakpoint
DELETE FROM `invoice_items` WHERE `kind` IN ('electricity', 'water') OR `expense_id` IS NOT NULL OR `utility_bill_id` IS NOT NULL;--> statement-breakpoint
UPDATE `invoices` SET
  `total_paise` = coalesce((SELECT sum(`amount_paise`) FROM `invoice_items` WHERE `invoice_items`.`invoice_id` = `invoices`.`id`), 0),
  `paid_paise` = coalesce((SELECT sum(`amount_paise`) FROM `payments` WHERE `payments`.`invoice_id` = `invoices`.`id` AND `payments`.`voided_at` IS NULL), 0);--> statement-breakpoint
-- 2) Schema. SQLite cannot drop foreign-key columns, so invoice_items is rebuilt without expense_id / utility_bill_id.
CREATE TABLE `invoice_items_new` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `invoice_items_new` (`id`, `invoice_id`, `kind`, `description`, `amount_paise`, `created_at`) SELECT `id`, `invoice_id`, `kind`, `description`, `amount_paise`, `created_at` FROM `invoice_items`;--> statement-breakpoint
DROP TABLE `invoice_items`;--> statement-breakpoint
ALTER TABLE `invoice_items_new` RENAME TO `invoice_items`;--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_item_rent_uq` ON `invoice_items` (`invoice_id`) WHERE "invoice_items"."kind" = 'rent';--> statement-breakpoint
ALTER TABLE `invoices` DROP COLUMN `rent_paid_paise`;--> statement-breakpoint
ALTER TABLE `invoices` DROP COLUMN `expense_paid_paise`;--> statement-breakpoint
ALTER TABLE `payment_claims` DROP COLUMN `purpose`;--> statement-breakpoint
ALTER TABLE `payment_claims` DROP COLUMN `invoice_item_id`;--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `purpose`;--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `invoice_item_id`;--> statement-breakpoint
ALTER TABLE `rent_settings` DROP COLUMN `electricity_method`;--> statement-breakpoint
ALTER TABLE `rent_settings` DROP COLUMN `water_method`;--> statement-breakpoint
DROP TABLE `expense_allocations`;--> statement-breakpoint
DROP TABLE `expense_receipts`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
DROP TABLE `utility_allocations`;--> statement-breakpoint
DROP TABLE `utility_bills`;
