CREATE TABLE `dictation` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`transcriber` text DEFAULT '' NOT NULL,
	`model_id` text DEFAULT '' NOT NULL,
	`provider_id` text DEFAULT '' NOT NULL,
	`readiness` text DEFAULT '' NOT NULL,
	`measured_rtf` real,
	`measured_model_id` text DEFAULT '' NOT NULL,
	`at` integer DEFAULT 0 NOT NULL
);
