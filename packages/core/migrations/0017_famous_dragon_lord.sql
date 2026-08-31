CREATE TABLE `context_ceilings` (
	`runtime_id` text NOT NULL,
	`model` text NOT NULL,
	`tokens` integer NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`runtime_id`, `model`)
);
