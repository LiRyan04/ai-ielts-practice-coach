CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email_unique` ON `accounts` (`email`);--> statement-breakpoint
CREATE TABLE `api_settings` (
	`account_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'dashscope' NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`encrypted_api_key` text,
	`api_key_last_four` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `attempts` ADD `account_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `attempts_account_id_updated_at_idx` ON `attempts` (`account_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `learner_profiles` ADD `daily_minutes` integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `learner_profiles` ADD `interface_language` text DEFAULT 'zh-CN' NOT NULL;
