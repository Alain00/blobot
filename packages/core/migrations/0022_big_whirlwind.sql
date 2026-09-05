CREATE TABLE `pictures` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`source` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`name` text,
	`tool_name` text,
	`written_at` integer,
	`data` blob NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
