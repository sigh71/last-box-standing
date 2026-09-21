CREATE TABLE `nominations` (
	`slot_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`nominated_by` integer NOT NULL,
	`eliminated_round` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`slot_id`, `game_id`),
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`nominated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vetoes` (
	`slot_id` integer NOT NULL,
	`round` integer NOT NULL,
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	PRIMARY KEY(`slot_id`, `round`, `user_id`),
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `slots` ADD `pick_state` text DEFAULT 'nominating' NOT NULL;--> statement-breakpoint
ALTER TABLE `slots` ADD `pick_round` integer DEFAULT 0 NOT NULL;