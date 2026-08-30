CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`mime_type` text NOT NULL,
	`name` text,
	`bytes` integer NOT NULL,
	`data` blob NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_attachments` (
	`message_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`message_id`, `attachment_id`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `message_attachments_message` ON `message_attachments` (`message_id`);