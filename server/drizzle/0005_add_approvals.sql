CREATE TABLE `approvals` (
	`slot_id` integer NOT NULL,
	`round` integer NOT NULL,
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	PRIMARY KEY(`slot_id`, `round`, `user_id`, `game_id`),
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
