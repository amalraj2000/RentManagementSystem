CREATE TABLE `expense_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "receipt_size_range" CHECK("expense_receipts"."size_bytes" > 0 and "expense_receipts"."size_bytes" <= 2097152)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_receipts_expense_id_unique` ON `expense_receipts` (`expense_id`);