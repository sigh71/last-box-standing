import { Hono } from "hono";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { games, copies, copyExpansions } from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../auth/middleware.js";
import { bggErrorResponse } from "../services/bgg.js";
import {
  resolveGameId,
  searchLibrary,
  effectivePlayerRange,
  UnknownGameError,
  type GameInput,
} from "../services/games.js";

/**
 * The group's game library. Doubles as the BoardGameGeek details cache, so
 * everything here is already stored — listing never touches BGG.
 */
const router = new Hono<{ Variables: AuthVariables }>();
router.use("*", requireAuth);

router.get("/", (c) => {
  const q = c.req.query("q") ?? "";
  // Typeahead callers want a short list; the Library page asks for `all`.
  const limitParam = c.req.query("limit");
  const limit =
    limitParam === "all"
      ? null
      : limitParam && Number.isFinite(Number(limitParam))
        ? Number(limitParam)
        : 20;
  const rows = searchLibrary(q, limit);

  const gameIds = rows.map((g) => g.id);
  const copyRows = gameIds.length
    ? db.select().from(copies).where(inArray(copies.gameId, gameIds)).all()
    : [];
  const copyIds = copyRows.map((c2) => c2.id);
  const expansionRows = copyIds.length
    ? db.select().from(copyExpansions).where(inArray(copyExpansions.copyId, copyIds)).all()
    : [];

  return c.json({
    games: rows.map((g) => ({
      ...g,
      copies: copyRows
        .filter((c2) => c2.gameId === g.id)
        .map((c2) => {
          const expansionGameIds = expansionRows
            .filter((e) => e.copyId === c2.id)
            .map((e) => e.expansionGameId);
          return {
            ...c2,
            expansionGameIds,
            // What this particular box seats, expansions included.
            ...effectivePlayerRange(g.id, expansionGameIds),
          };
        }),
    })),
  });
});

/** Add a game to the library without nominating it. */
router.post("/", async (c) => {
  const body = await c.req.json<{ bggId?: number; game?: GameInput }>();

  // Don't create a second entry for a game we already have under this title.
  const title = body.game?.title?.trim();
  if (title && body.bggId == null) {
    const existing = db
      .select()
      .from(games)
      .where(sql`lower(${games.title}) = ${title.toLowerCase()}`)
      .get();
    if (existing) return c.json({ gameId: existing.id, existed: true });
  }

  try {
    const gameId = await resolveGameId(body, c.get("user")!.id);
    return c.json({ gameId, existed: false }, 201);
  } catch (err) {
    if (err instanceof UnknownGameError) return c.json({ error: err.message }, 400);
    console.error("Adding game failed:", err);
    const { status, body: errBody } = bggErrorResponse(err);
    return c.json(errBody, status);
  }
});

/** Only allowed while the game isn't referenced by any nomination or play. */
router.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  try {
    db.delete(games).where(eq(games.id, id)).run();
    return c.json({ ok: true });
  } catch {
    return c.json(
      { error: "That game is part of a weekend's nominations or schedule, so it can't be removed." },
      409,
    );
  }
});

export default router;
