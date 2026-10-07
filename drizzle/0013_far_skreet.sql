CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`payload_json` text NOT NULL,
	`result_json` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`started_at` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `ai_jobs_account_created_idx` ON `ai_jobs` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_jobs_status_updated_idx` ON `ai_jobs` (`status`,`updated_at`);
