import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { slots, plays, playPlayers } from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../auth/middleware.js";

/** Editing the games/players within a decided session. */
const router = new Hono<{ Variables: AuthVariables }>();
router.use("*", requireAuth);

/**
 * Seats players at a play, in the order given.
 *
 * `ranked` says whether that order is a *result*. When it is, the array index
 * becomes the finishing position (1 = won); when it isn't, positions stay NULL
 * so nothing later mistakes "these six were at the table" for "these six
 * finished in this order".
 */
function setPlayers(playId: number, playerIds: number[], ranked: boolean): number[] {
  const ordered = [...new Set(playerIds)];
  db.delete(playPlayers).where(eq(playPlayers.playId, playId)).run();
  if (ordered.length > 0) {
    db.insert(playPlayers)
      .values(
        ordered.map((userId, i) => ({
          playId,
          userId,
          position: ranked ? i + 1 : null,
        })),
      )
      .run();
  }
  return ordered;
}

router.post("/slots/:slotId/plays", async (c) => {
  const slotId = Number(c.req.param("slotId"));
  const slot = db.select().from(slots).where(eq(slots.id, slotId)).get();
  if (!slot) return c.json({ error: "Session not found" }, 404);

  const body = await c.req.json<{
    gameId?: number;
    playerIds?: number[];
    ranked?: boolean;
    notes?: string;
  }>();
  if (!body.gameId) return c.json({ error: "gameId required" }, 400);

  const play = db
    .insert(plays)
    .values({ slotId, gameId: body.gameId, notes: body.notes ?? null })
    .returning()
    .get();
  const playerIds = setPlayers(play.id, body.playerIds ?? [], body.ranked === true);
  return c.json({ play: { ...play, playerIds } }, 201);
});

router.patch("/plays/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = db.select().from(plays).where(eq(plays.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<{
    gameId?: number;
    playerIds?: number[];
    ranked?: boolean;
    notes?: string | null;
  }>();
  if (body.gameId != null || body.notes !== undefined) {
    db.update(plays)
      .set({
        ...(body.gameId != null ? { gameId: body.gameId } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      })
      .where(eq(plays.id, id))
      .run();
  }
  if (Array.isArray(body.playerIds)) {
    setPlayers(id, body.playerIds, body.ranked === true);
  }
  return c.json({ ok: true });
});

router.delete("/plays/:id", (c) => {
  const id = Number(c.req.param("id"));
  db.delete(plays).where(eq(plays.id, id)).run();
  return c.json({ ok: true });
});

export default router;
