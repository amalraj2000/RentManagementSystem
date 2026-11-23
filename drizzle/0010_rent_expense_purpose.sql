ALTER TABLE `invoices` ADD `rent_paid_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `expense_paid_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_claims` ADD `purpose` text DEFAULT 'rent' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `purpose` text DEFAULT 'rent' NOT NULL;--> statement-breakpoint
-- Existing payments (if any) were not tagged: treat them as rent, which is exactly what recomputeInvoice would produce.
UPDATE `invoices` SET `rent_paid_paise` = `paid_paise`, `expense_paid_paise` = 0;
