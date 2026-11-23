ALTER TABLE `rent_settings` ADD `upi_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rent_settings` ADD `upi_payee_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_profiles` ADD `date_of_birth` text;