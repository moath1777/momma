CREATE TABLE `data_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	`uploaded_by` text,
	`size_bytes` integer NOT NULL,
	`row_count` integer NOT NULL,
	`stage_names` text NOT NULL,
	`data_json` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL
);
