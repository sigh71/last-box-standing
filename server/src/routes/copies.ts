import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { copies, copyExpansions, games } from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../auth/middleware.js";

/**
 * Physical copies of games. Several people can own copies of the same title,
 * and each box has its own expansions in it.
 */
const router = new Hono<{ Variables: AuthVariables }>();
router.use("*", requireAuth);

router.post("/", async (c) => {
  const { gameId } = await c.req.json<{ gameId?: number }>();
  if (gameId == null) return c.json({ error: "gameId required" }, 400);

  const game = db.select().from(games).where(eq(games.id, gameId)).get();
  if (!game) return c.json({ error: "No such game" }, 404);
  if (game.bggType === "boardgameexpansion") {
    return c.json(
      { error: "Expansions belong to a copy of their base game, not a copy of their own." },
      400,
    );
  }

  // Defaults to the common case: the group owns it collectively, and it lives
  // with whoever added it until someone says otherwise.
  const copy = db
    .insert(copies)
    .values({ gameId, ownerKind: "group", holderUserId: c.get("user")!.id })
    .returning()
    .get();
  return c.json({ copy }, 201);
});

router.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const copy = db.select().from(copies).where(eq(copies.id, id)).get();
  if (!copy) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<{
    ownerKind?: "member" | "group" | null;
    ownerUserId?: number | null;
    holderUserId?: number | null;
    notes?: string | null;
  }>();

  const set: Record<string, unknown> = {};
  if (body.ownerKind !== undefined) {
    if (body.ownerKind !== null && body.ownerKind !== "member" && body.ownerKind !== "group") {
      return c.json({ error: "ownerKind must be 'member', 'group' or null" }, 400);
    }
    set.ownerKind = body.ownerKind;
    // "The group owns it" and "nobody owns it" have no individual owner.
    if (body.ownerKind !== "member") set.ownerUserId = null;
  }
  if (body.ownerUserId !== undefined && set.ownerUserId === undefined) {
    set.ownerUserId = body.ownerUserId;
  }
  if (body.holderUserId !== undefined) set.holderUserId = body.holderUserId;
  if (body.notes !== undefined) set.notes = body.notes;

  if (Object.keys(set).length === 0) return c.json({ error: "nothing to update" }, 400);
  db.update(copies).set(set).where(eq(copies.id, id)).run();
  return c.json({ copy: db.select().from(copies).where(eq(copies.id, id)).get() });
});

router.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  db.delete(copies).where(eq(copies.id, id)).run();
  return c.json({ ok: true });
});

// ---- Which expansions are in this box ----

router.put("/:id/expansions/:expansionGameId", (c) => {
  const copyId = Number(c.req.param("id"));
  const expansionGameId = Number(c.req.param("expansionGameId"));
  const copy = db.select().from(copies).where(eq(copies.id, copyId)).get();
  if (!copy) return c.json({ error: "Not found" }, 404);

  const expansion = db.select().from(games).where(eq(games.id, expansionGameId)).get();
  if (!expansion) return c.json({ error: "No such game" }, 404);
  if (expansion.baseGameId !== copy.gameId) {
    return c.json({ error: "That expansion isn't for this game" }, 400);
  }

  db.insert(copyExpansions).values({ copyId, expansionGameId }).onConflictDoNothing().run();
  return c.json({ ok: true });
});

router.delete("/:id/expansions/:expansionGameId", (c) => {
  const copyId = Number(c.req.param("id"));
  const expansionGameId = Number(c.req.param("expansionGameId"));
  db.delete(copyExpansions)
    .where(
      and(
        eq(copyExpansions.copyId, copyId),
        eq(copyExpansions.expansionGameId, expansionGameId),
      ),
    )
    .run();
  return c.json({ ok: true });
});

export default router;
