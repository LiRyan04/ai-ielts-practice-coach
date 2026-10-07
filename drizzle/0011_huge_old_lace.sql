CREATE TABLE `tutor_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`provider` text,
	`model` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tutor_messages_account_created_idx` ON `tutor_messages` (`account_id`,`created_at`);