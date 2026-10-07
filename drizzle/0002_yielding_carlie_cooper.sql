CREATE TABLE `content_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`source_repository` text NOT NULL,
	`source_commit` text NOT NULL,
	`imported_at` text NOT NULL,
	`stats_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reading_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`correct_count` integer NOT NULL,
	`scored_count` integer NOT NULL,
	`band_score` real NOT NULL,
	`answers_json` text NOT NULL,
	`result_json` text NOT NULL,
	`submitted_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reading_attempts_account_submitted_idx` ON `reading_attempts` (`account_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `reading_attempts_paper_idx` ON `reading_attempts` (`paper_id`);--> statement-breakpoint
CREATE TABLE `reading_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`collection_title` text NOT NULL,
	`title` text NOT NULL,
	`source_type` text NOT NULL,
	`source_reference` text NOT NULL,
	`verification_status` text NOT NULL,
	`is_private` integer DEFAULT true NOT NULL,
	`passage_count` integer NOT NULL,
	`question_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reading_passages` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`passage_number` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`difficulty` text,
	`article` text NOT NULL,
	`questions_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reading_passages_paper_number_idx` ON `reading_passages` (`paper_id`,`passage_number`);