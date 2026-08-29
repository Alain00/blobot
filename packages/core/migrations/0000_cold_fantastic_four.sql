CREATE TABLE `agent_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`provider_message_id` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_messages_turn` ON `agent_messages` (`turn_id`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`runtime_id` text NOT NULL,
	`executable_path` text,
	`model` text,
	`workspace_path` text NOT NULL,
	`branch` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_team_name` ON `agents` (`team_id`,`name`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`agent_id` text,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_team` ON `events` (`team_id`,`at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`from_agent_id` text,
	`to_agent_id` text NOT NULL,
	`body` text NOT NULL,
	`context` text,
	`idempotency_key` text,
	`at` integer NOT NULL,
	`delivered_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_idempotency_key_unique` ON `messages` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `messages_mailbox` ON `messages` (`to_agent_id`,`delivered_at`);--> statement-breakpoint
CREATE INDEX `messages_team_stream` ON `messages` (`team_id`,`at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`provider_session_id` text,
	`persona_text` text NOT NULL,
	`started_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`workspace_path` text NOT NULL,
	`workspace_kind` text NOT NULL,
	`turn_budget` integer DEFAULT 10 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_name_unique` ON `teams` (`name`);--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`provider_tool_call_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text,
	`arguments` text,
	`status` text NOT NULL,
	`exit_code` integer,
	`failure_reason` text,
	`output` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tool_calls_turn` ON `tool_calls` (`turn_id`);--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`session_id` text NOT NULL,
	`trigger_message_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`stop_reason` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trigger_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `turns_agent` ON `turns` (`agent_id`,`started_at`);