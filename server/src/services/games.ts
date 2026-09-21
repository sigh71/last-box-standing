import { eq, like, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { games, type Game } from "../db/schema.js";
import { fetchBggGame } from "./bgg.js";

export interface PlayerRange {
  minPlayers: number;
  maxPlayers: number;
}

/**
 * How many people a game seats once its expansions are in the box. Expansions
 * widen the range in both directions — some add a player, some add a solo mode
 * — so take the widest span across the base game and everything included.
 */
export function effectivePlayerRange(
  baseGameId: number,
  expansionGameIds: number[] = [],
): PlayerRange {
  const base = db.select().from(games).where(eq(games.id, baseGameId)).get();
  let min = base?.minPlayers ?? 1;
  let max = base?.maxPlayers ?? 99;

  if (expansionGameIds.length > 0) {
    for (const e of db.select().from(games).where(inArray(games.id, expansionGameIds)).all()) {
      min = Math.min(min, e.minPlayers);
      max = Math.max(max, e.maxPlayers);
    }
  }
  return { minPlayers: min, maxPlayers: max };
}

export interface GameInput {
  title?: string;
  bggId?: number | null;
  minPlayers?: number;
  maxPlayers?: number;
  playtimeMinutes?: number | null;
  length?: "long" | "short";
  thumbnailUrl?: string | null;
}

export class UnknownGameError extends Error {}

/**
 * Resolves a game reference to a library game id, hitting BoardGameGeek only
 * when the game is genuinely new to us. Accepts, in order of preference:
 *
 * - `gameId`   — already in the library, nothing to do
 * - `bggId`    — reuse the library row if we have it, else fetch once and store
 * - `game`     — manual entry
 */
export async function resolveGameId(
  input: { gameId?: number; bggId?: number; game?: GameInput },
  userId: number,
): Promise<number> {
  if (input.gameId != null) return input.gameId;

  const bggId = input.bggId ?? input.game?.bggId ?? null;
  if (bggId != null) {
    const existing = db.select().from(games).where(eq(games.bggId, bggId)).get();
    if (existing) return existing.id;

    // First time anyone has picked this game — pull the details once and keep them.
    const details = await fetchBggGame(bggId);
    if (details) {
      const { baseBggId, ...row } = details;
      // An expansion is only meaningful alongside its base game, so make sure
      // that's in the library too (one extra fetch, once, ever).
      let baseGameId: number | null = null;
      if (baseBggId != null) {
        baseGameId = await resolveGameId({ bggId: baseBggId }, userId);
      }
      return db
        .insert(games)
        .values({ ...row, baseGameId, addedBy: userId, bggFetchedAt: new Date() })
        .returning()
        .get().id;
    }
    if (input.bggId != null && !input.game?.title?.trim()) {
      throw new UnknownGameError(`BoardGameGeek has no game ${bggId}`);
    }
  }

  const g = input.game;
  if (!g?.title?.trim()) {
    throw new UnknownGameError("gameId, bggId or game.title is required");
  }

  return db
    .insert(games)
    .values({
      title: g.title.trim(),
      bggId: bggId ?? null,
      minPlayers: g.minPlayers ?? 1,
      maxPlayers: g.maxPlayers ?? 99,
      playtimeMinutes: g.playtimeMinutes ?? null,
      length: g.length ?? ((g.playtimeMinutes ?? 0) >= 120 ? "long" : "short"),
      thumbnailUrl: g.thumbnailUrl ?? null,
      addedBy: userId,
    })
    .returning()
    .get().id;
}

/**
 * Splits a chosen game into the thing that actually gets played: an expansion
 * resolves to its base game, carried along as an attachment. "Ark Nova +
 * Marine Worlds" is one nomination, not two competing candidates.
 */
export function asBaseAndExpansion(gameId: number): {
  baseGameId: number;
  expansionGameId: number | null;
} {
  const game = db.select().from(games).where(eq(games.id, gameId)).get();
  if (game?.bggType === "boardgameexpansion" && game.baseGameId != null) {
    return { baseGameId: game.baseGameId, expansionGameId: game.id };
  }
  return { baseGameId: gameId, expansionGameId: null };
}

/**
 * Title search over the group's own library — never touches BGG.
 *
 * `limit` caps typeahead lists; pass `null` for the whole library, which is what
 * the Library page and the "do we already own this?" check need — a silent cap
 * there hides games people have added. (`null`, not `undefined`: an explicit
 * `undefined` would just re-trigger the default.)
 */
export function searchLibrary(query: string, limit: number | null = 20): Game[] {
  const q = query.trim();
  const rows = db
    .select()
    .from(games)
    .where(q ? like(games.title, `%${q}%`) : undefined)
    .orderBy(games.title);
  return limit != null && limit > 0 ? rows.limit(limit).all() : rows.all();
}
