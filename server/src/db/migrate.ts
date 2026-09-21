import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "./index.js";

/**
 * Applies any pending Drizzle migrations from the ./drizzle folder.
 * Called on server startup so the DB schema is always current.
 *
 * Foreign keys are disabled for the duration: changing a column type or
 * nullability makes SQLite rebuild the table (drop + recreate), which trips FK
 * constraints from referencing tables. The `PRAGMA foreign_keys=OFF` that
 * drizzle-kit writes into those migrations is silently ignored because it sits
 * inside the migration transaction, so it has to be toggled out here instead.
 */
export function runMigrations(): void {
  const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
  sqlite.pragma("foreign_keys = OFF");
  try {
    migrate(db, { migrationsFolder });
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }

  // Without enforcement above, a bad migration could leave dangling rows.
  const violations = sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error(
      `Migrations left ${violations.length} foreign key violation(s): ` +
        JSON.stringify(violations.slice(0, 5)),
    );
  }
}

// Allow running directly: `npm run db:migrate`. Compare resolved paths rather
// than building a file:// URL by hand — that never matches on Windows, which
// silently turned this script into a no-op.
const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === resolve(fileURLToPath(import.meta.url))) {
  runMigrations();
  console.log("Migrations applied.");
}
