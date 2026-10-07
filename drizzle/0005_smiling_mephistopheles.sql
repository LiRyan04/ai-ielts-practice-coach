PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_settings` (
	`account_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'dashscope' NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`tts_model` text DEFAULT 'mimo-v2.5-tts' NOT NULL,
	`tts_voice` text DEFAULT 'Mia' NOT NULL,
	`encrypted_api_key` text,
	`api_key_last_four` text,
	`mimo_encrypted_api_key` text,
	`mimo_api_key_last_four` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_api_settings`("account_id", "provider", "base_url", "model", "tts_model", "tts_voice", "encrypted_api_key", "api_key_last_four", "mimo_encrypted_api_key", "mimo_api_key_last_four", "updated_at") SELECT "account_id", "provider", "base_url", "model", 'mimo-v2.5-tts', 'Mia', "encrypted_api_key", "api_key_last_four", NULL, NULL, "updated_at" FROM `api_settings`;--> statement-breakpoint
DROP TABLE `api_settings`;--> statement-breakpoint
ALTER TABLE `__new_api_settings` RENAME TO `api_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
