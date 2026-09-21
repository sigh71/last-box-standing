CREATE TABLE `copies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`owner_kind` text,
	`owner_user_id` integer,
	`holder_user_id` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `copy_expansions` (
	`copy_id` integer NOT NULL,
	`expansion_game_id` integer NOT NULL,
	PRIMARY KEY(`copy_id`, `expansion_game_id`),
	FOREIGN KEY (`copy_id`) REFERENCES `copies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expansion_game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Ownership moves off the game definition and onto a physical copy. Anything
-- already recorded becomes that game's first copy. (created_at is in seconds:
-- drizzle's integer timestamp mode, not milliseconds.)
INSERT INTO `copies` (`game_id`, `owner_kind`, `owner_user_id`, `holder_user_id`, `created_at`)
SELECT `id`, `owner_kind`, `owner_user_id`, `holder_user_id`, strftime('%s','now') FROM `games`
WHERE `owner_kind` IS NOT NULL OR `owner_user_id` IS NOT NULL OR `holder_user_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `games` DROP COLUMN `owner_kind`;--> statement-breakpoint
ALTER TABLE `games` DROP COLUMN `owner_user_id`;--> statement-breakpoint
ALTER TABLE `games` DROP COLUMN `holder_user_id`;