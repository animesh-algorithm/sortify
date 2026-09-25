CREATE TABLE `feature_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`features` text,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`suggestion_id` text NOT NULL,
	`revision` integer NOT NULL,
	`name` text NOT NULL,
	`track_ids` text NOT NULL,
	`playlist_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`offset` integer DEFAULT 0 NOT NULL,
	`uncertain` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publication_revision` ON `publications` (`run_id`,`suggestion_id`,`revision`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`approved_revision` integer,
	`cancelled` integer DEFAULT false NOT NULL,
	`data` text NOT NULL,
	`error` text,
	`created` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_run` ON `runs` (`user_id`) WHERE "runs"."status" in ('queued','importing','enriching','analyzing','publishing');--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`access` text NOT NULL,
	`refresh` text NOT NULL,
	`expires` integer NOT NULL
);
