ALTER TABLE `listening_papers` ADD `owner_account_id` text;--> statement-breakpoint
CREATE INDEX `listening_papers_owner_created_idx` ON `listening_papers` (`owner_account_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `reading_papers` ADD `owner_account_id` text;--> statement-breakpoint
CREATE INDEX `reading_papers_owner_created_idx` ON `reading_papers` (`owner_account_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `writing_prompts` ADD `account_id` text;--> statement-breakpoint
ALTER TABLE `writing_prompts` ADD `collection_id` text DEFAULT 'ai' NOT NULL;--> statement-breakpoint
CREATE INDEX `writing_prompts_account_created_idx` ON `writing_prompts` (`account_id`,`created_at`);