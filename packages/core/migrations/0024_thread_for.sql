ALTER TABLE `teams` ADD `thread_for` text;--> statement-breakpoint
CREATE UNIQUE INDEX `teams_thread_for_unique` ON `teams` (`thread_for`);