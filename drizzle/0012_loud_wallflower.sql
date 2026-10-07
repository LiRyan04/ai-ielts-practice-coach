CREATE TABLE `practice_diagnoses` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`skill` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `practice_diagnoses_account_created_idx` ON `practice_diagnoses` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `practice_diagnoses_attempt_created_idx` ON `practice_diagnoses` (`attempt_id`,`created_at`);