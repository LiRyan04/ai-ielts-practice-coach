ALTER TABLE `listening_attempts` ADD `progress_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `listening_attempts` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `listening_attempts` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `reading_attempts` ADD `progress_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `reading_attempts` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `reading_attempts` ADD `updated_at` text;