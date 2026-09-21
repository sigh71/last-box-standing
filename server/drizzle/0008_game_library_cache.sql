CREATE TABLE `bgg_search_cache` (
	`query` text PRIMARY KEY NOT NULL,
	`results` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `games` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `games` ADD `year_published` integer;--> statement-breakpoint
ALTER TABLE `games` ADD `description` text;--> statement-breakpoint
ALTER TABLE `games` ADD `bgg_fetched_at` integer;--> statement-breakpoint
ALTER TABLE `games` ADD `owner_kind` text;--> statement-breakpoint
ALTER TABLE `games` ADD `owner_user_id` integer;--> statement-breakpoint
ALTER TABLE `games` ADD `holder_user_id` integer;--> statement-breakpoint
-- Collapse duplicate BGG entries before the unique index can be added. These
-- were possible until now (repeated dev seeding created them); references are
-- repointed at the lowest id for each bgg_id, and any that would collide with
-- an existing row (composite primary keys) are dropped instead.
UPDATE OR IGNORE `nominations` SET `game_id` = (SELECT MIN(g2.id) FROM `games` g2 WHERE g2.bgg_id = (SELECT g1.bgg_id FROM `games` g1 WHERE g1.id = `nominations`.`game_id`)) WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NOT NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id = g.bgg_id));--> statement-breakpoint
UPDATE OR IGNORE `approvals` SET `game_id` = (SELECT MIN(g2.id) FROM `games` g2 WHERE g2.bgg_id = (SELECT g1.bgg_id FROM `games` g1 WHERE g1.id = `approvals`.`game_id`)) WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NOT NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id = g.bgg_id));--> statement-breakpoint
UPDATE OR IGNORE `plays` SET `game_id` = (SELECT MIN(g2.id) FROM `games` g2 WHERE g2.bgg_id = (SELECT g1.bgg_id FROM `games` g1 WHERE g1.id = `plays`.`game_id`)) WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NOT NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id = g.bgg_id));--> statement-breakpoint
DELETE FROM `nominations` WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NOT NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id = g.bgg_id));--> statement-breakpoint
DELETE FROM `approvals` WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NOT NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id = g.bgg_id));--> statement-breakpoint
DELETE FROM `plays` WHERE `game_id` IN (SELECT g.id FROM `games` g WHERE g.bgg_id IS NOT NULL AND g.id > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id = g.bgg_id));--> statement-breakpoint
DELETE FROM `games` WHERE `bgg_id` IS NOT NULL AND `id` > (SELECT MIN(g3.id) FROM `games` g3 WHERE g3.bgg_id = `games`.`bgg_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `games_bgg_id_unique` ON `games` (`bgg_id`);