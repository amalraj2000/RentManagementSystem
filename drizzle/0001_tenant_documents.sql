CREATE TABLE `tenant_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`id_type` text,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`data` blob NOT NULL,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "doc_size_range" CHECK("tenant_documents"."size_bytes" > 0 and "tenant_documents"."size_bytes" <= 2097152)
);
--> statement-breakpoint
CREATE INDEX `tenant_docs_tenant_idx` ON `tenant_documents` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_photo_uq` ON `tenant_documents` (`tenant_id`) WHERE "tenant_documents"."kind" = 'photo';