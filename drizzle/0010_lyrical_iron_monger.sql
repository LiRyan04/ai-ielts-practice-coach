CREATE TABLE `practice_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`result_json` text NOT NULL,
	`record_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `practice_summaries_account_created_idx` ON `practice_summaries` (`account_id`,`created_at`);