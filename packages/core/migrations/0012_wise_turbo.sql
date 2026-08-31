CREATE TABLE `routine_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`fired_at` integer NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`seen_at` integer,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `routine_runs_routine` ON `routine_runs` (`routine_id`,`fired_at`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`schedule_kind` text NOT NULL,
	`schedule_minute` integer NOT NULL,
	`schedule_hour` integer,
	`schedule_weekday` integer,
	`armed` integer DEFAULT false NOT NULL,
	`proposed_by` text,
	`last_settled_at` integer,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposed_by`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `routines_agent` ON `routines` (`agent_id`);