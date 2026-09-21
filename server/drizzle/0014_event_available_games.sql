CREATE TABLE `event_available_games` (
	`event_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	PRIMARY KEY(`event_id`, `game_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
