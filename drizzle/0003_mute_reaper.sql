CREATE TABLE `listening_attempts` (
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
CREATE INDEX `listening_attempts_account_submitted_idx` ON `listening_attempts` (`account_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `listening_attempts_paper_idx` ON `listening_attempts` (`paper_id`);--> statement-breakpoint
CREATE TABLE `listening_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`collection_title` text NOT NULL,
	`title` text NOT NULL,
	`source_type` text NOT NULL,
	`source_reference` text NOT NULL,
	`verification_status` text NOT NULL,
	`is_private` integer DEFAULT true NOT NULL,
	`section_count` integer NOT NULL,
	`question_count` integer NOT NULL,
	`audio_section_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listening_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`section_number` integer NOT NULL,
	`title` text NOT NULL,
	`context` text,
	`question_type` text,
	`transcript` text NOT NULL,
	`audio_json` text NOT NULL,
	`questions_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `listening_sections_paper_number_idx` ON `listening_sections` (`paper_id`,`section_number`);