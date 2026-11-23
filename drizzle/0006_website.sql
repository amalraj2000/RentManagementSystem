CREATE TABLE `site_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`data` blob NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "site_photo_size" CHECK("site_photos"."size_bytes" > 0 and "site_photos"."size_bytes" <= 2097152)
);
--> statement-breakpoint
CREATE INDEX `site_photos_order_idx` ON `site_photos` (`sort_order`,`created_at`);--> statement-breakpoint
ALTER TABLE `rent_settings` ADD `pg_name` text DEFAULT 'Our PG' NOT NULL;--> statement-breakpoint
ALTER TABLE `rent_settings` ADD `tagline` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rent_settings` ADD `about` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rent_settings` ADD `address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rent_settings` ADD `contact_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rent_settings` ADD `whatsapp` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rent_settings` ADD `contact_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rent_settings` ADD `maps_link` text DEFAULT '' NOT NULL;