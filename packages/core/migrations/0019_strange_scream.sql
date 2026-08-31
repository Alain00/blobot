CREATE TABLE `handbook_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`ordinal` integer NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`removed_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `handbook_entries_agent` ON `handbook_entries` (`team_id`,`agent_name`);