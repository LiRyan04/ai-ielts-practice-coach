ALTER TABLE `api_settings` ADD `tts_provider` text DEFAULT 'mimo' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_settings` ADD `tts_base_url` text DEFAULT 'https://api.xiaomimimo.com/v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_settings` ADD `tts_encrypted_api_key` text;--> statement-breakpoint
ALTER TABLE `api_settings` ADD `tts_api_key_last_four` text;--> statement-breakpoint
UPDATE `api_settings` SET `tts_encrypted_api_key` = `mimo_encrypted_api_key`, `tts_api_key_last_four` = `mimo_api_key_last_four` WHERE `mimo_encrypted_api_key` IS NOT NULL;
