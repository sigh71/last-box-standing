CREATE TABLE `nomination_expansions` (
	`slot_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`expansion_game_id` integer NOT NULL,
	PRIMARY KEY(`slot_id`, `game_id`, `expansion_game_id`),
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expansion_game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `play_expansions` (
	`play_id` integer NOT NULL,
	`expansion_game_id` integer NOT NULL,
	PRIMARY KEY(`play_id`, `expansion_game_id`),
	FOREIGN KEY (`play_id`) REFERENCES `plays`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expansion_game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `games` ADD `bgg_type` text DEFAULT 'boardgame' NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `base_game_id` integer;--> statement-breakpoint
-- Collapse manually-entered duplicates (same title, no bgg_id) so the library
-- doesn't show the same game twice. Same repointing approach as 0008: keep the
-- lowest id, move references to it, drop any that would collide.
UPDATE OR IGNORE `nominations` SET `game_id` = (SELECT MIN(g2.id) FROM `games` g2 WHERE g2.bgg_id IS NULL AND LOWER(g2.title) = (SELECT LOWER(g1.title) FROM `games` g1 WHERE g1.id = `nominations`.`game_id`)) WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id IS NULL AND LOWER(g3.title) = LOWER(g.title)));--> statement-breakpoint
UPDATE OR IGNORE `approvals` SET `game_id` = (SELECT MIN(g2.id) FROM `games` g2 WHERE g2.bgg_id IS NULL AND LOWER(g2.title) = (SELECT LOWER(g1.title) FROM `games` g1 WHERE g1.id = `approvals`.`game_id`)) WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id IS NULL AND LOWER(g3.title) = LOWER(g.title)));--> statement-breakpoint
UPDATE OR IGNORE `plays` SET `game_id` = (SELECT MIN(g2.id) FROM `games` g2 WHERE g2.bgg_id IS NULL AND LOWER(g2.title) = (SELECT LOWER(g1.title) FROM `games` g1 WHERE g1.id = `plays`.`game_id`)) WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id IS NULL AND LOWER(g3.title) = LOWER(g.title)));--> statement-breakpoint
DELETE FROM `nominations` WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id IS NULL AND LOWER(g3.title) = LOWER(g.title)));--> statement-breakpoint
DELETE FROM `approvals` WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id IS NULL AND LOWER(g3.title) = LOWER(g.title)));--> statement-breakpoint
DELETE FROM `plays` WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id IS NULL AND LOWER(g3.title) = LOWER(g.title)));--> statement-breakpoint
DELETE FROM `games` WHERE `bgg_id` IS NULL AND `id` > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id IS NULL AND LOWER(g3.title) = LOWER(`games`.`title`));