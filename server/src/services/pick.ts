import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  slots,
  nominations,
  nominationExpansions,
  plays,
  playPlayers,
  playExpansions,
  eventAttendees,
} from "../db/schema.js";

/**
 * Locks in a session's result: the surviving nominations (not eliminated)
 * become plays, and the session moves to `decided`. For a 1-game session every
 * attendee is seated at the single game; 2-game sessions leave players to be
 * assigned per table.
 */
export function decideSession(slotId: number): void {
  const slot = db.select().from(slots).where(eq(slots.id, slotId)).get();
  if (!slot) return;

  const survivors = db
    .select()
    .from(nominations)
    .where(and(eq(nominations.slotId, slotId), isNull(nominations.eliminatedRound)))
    .all();

  // Rebuild the session's plays from the survivors.
  db.delete(plays).where(eq(plays.slotId, slotId)).run();

  const attendees =
    slot.gameCount === 1
      ? db
          .select({ userId: eventAttendees.userId })
          .from(eventAttendees)
          .where(eq(eventAttendees.eventId, slot.eventId))
          .all()
      : [];

  const attached = db
    .select()
    .from(nominationExpansions)
    .where(eq(nominationExpansions.slotId, slotId))
    .all();

  for (const nom of survivors) {
    const play = db.insert(plays).values({ slotId, gameId: nom.gameId }).returning().get();
    if (attendees.length > 0) {
      db.insert(playPlayers)
        .values(attendees.map((a) => ({ playId: play.id, userId: a.userId })))
        .run();
    }
    // The expansions chosen alongside this game come with it.
    const expansions = attached.filter((e) => e.gameId === nom.gameId);
    if (expansions.length > 0) {
      db.insert(playExpansions)
        .values(expansions.map((e) => ({ playId: play.id, expansionGameId: e.expansionGameId })))
        .run();
    }
  }

  db.update(slots).set({ pickState: "decided" }).where(eq(slots.id, slotId)).run();
}
