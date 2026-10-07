CREATE TABLE `learning_completions` (
	`account_id` text NOT NULL,
	`activity_type` text NOT NULL,
	`activity_id` text NOT NULL,
	`local_date` text NOT NULL,
	`completed_at` text NOT NULL,
	PRIMARY KEY(`account_id`, `activity_type`, `activity_id`)
);
--> statement-breakpoint
CREATE INDEX `learning_completions_account_date_idx` ON `learning_completions` (`account_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `learning_daily_stats` (
	`account_id` text NOT NULL,
	`local_date` text NOT NULL,
	`active_seconds` integer DEFAULT 0 NOT NULL,
	`completed_exercises` integer DEFAULT 0 NOT NULL,
	`checked_in_at` text,
	`last_heartbeat_at` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`account_id`, `local_date`)
);
--> statement-breakpoint
CREATE INDEX `learning_daily_stats_account_date_idx` ON `learning_daily_stats` (`account_id`,`local_date`);