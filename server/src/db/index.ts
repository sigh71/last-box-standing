import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../env.js";
import * as schema from "./schema.js";

// Ensure the parent directory of the SQLite file exists (e.g. ./data or /data).
const dir = dirname(env.DATABASE_PATH);
if (dir && dir !== "." && !existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

export const sqlite = new Database(env.DATABASE_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
