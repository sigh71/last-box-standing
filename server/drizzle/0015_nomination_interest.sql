CREATE TABLE `nomination_interest` (
	`slot_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`stance` text NOT NULL,
	PRIMARY KEY(`slot_id`, `game_id`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slot_id`,`game_id`) REFERENCES `nominations`(`slot_id`,`game_id`) ON UPDATE no action ON DELETE cascade
);
