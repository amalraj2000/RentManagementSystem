CREATE TABLE `user_photos` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`data` blob NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_photo_size" CHECK("user_photos"."size_bytes" > 0 and "user_photos"."size_bytes" <= 2097152)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `phone` text;