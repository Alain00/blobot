CREATE TABLE `agent_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`runtime_id` text NOT NULL,
	`executable_path` text,
	`model` text,
	`instructions` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_profiles_name_unique` ON `agent_profiles` (`name`);--> statement-breakpoint
ALTER TABLE `agents` ADD `profile_id` text REFERENCES agent_profiles(id);--> statement-breakpoint
ALTER TABLE `agents` ADD `instructions` text;