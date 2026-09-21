import { isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

/**
 * Everyone who currently has access — i.e. not removed by an admin. Used for
 * default attendee lists and for validating attendee edits.
 */
export function activeUserIds(): number[] {
  return db
    .select({ id: users.id })
    .from(users)
    .where(isNull(users.deactivatedAt))
    .all()
    .map((u) => u.id);
}
