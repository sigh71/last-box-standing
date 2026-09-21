PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`google_id` text,
	`email` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`added_by` integer,
	`deactivated_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
-- NOTE: added_by/deactivated_at are new here, so they must be NULL rather than
-- selected from the old table (drizzle-kit generates the latter and it fails).
INSERT INTO `__new_users`("id", "google_id", "email", "name", "avatar_url", "added_by", "deactivated_at", "created_at") SELECT "id", "google_id", "email", "name", "avatar_url", NULL, NULL, "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);