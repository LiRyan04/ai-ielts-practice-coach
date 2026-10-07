CREATE TABLE `ai_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`overall_band` real NOT NULL,
	`confidence` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_assessments_attempt_id_idx` ON `ai_assessments` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`skill` text DEFAULT 'writing' NOT NULL,
	`task_type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`submitted_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attempts_updated_at_idx` ON `attempts` (`updated_at`);--> statement-breakpoint
CREATE TABLE `learner_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`target_band` real DEFAULT 7 NOT NULL,
	`current_band` real DEFAULT 5.5 NOT NULL,
	`exam_type` text DEFAULT 'academic' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`content` text NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `responses_attempt_id_unique` ON `responses` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `responses_attempt_id_idx` ON `responses` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `writing_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`task_type` text NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`source` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `writing_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`parent_response_id` text,
	`content` text NOT NULL,
	`word_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `writing_revisions_attempt_id_idx` ON `writing_revisions` (`attempt_id`);