ALTER TABLE `api_settings` ADD `tts_model` text DEFAULT 'qwen3-tts-flash' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_settings` ADD `tts_voice` text DEFAULT 'Cherry' NOT NULL;