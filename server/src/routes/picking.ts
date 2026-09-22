import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  slots,
  nominations,
  nominationExpansions,
  nominationInterest,
  approvals,
  plays,
} from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../auth/middleware.js";
import { isAdminEmail } from "../env.js";
import {
  resolveGameId,
  asBaseAndExpansion,
  UnknownGameError,
  type GameInput,
} from "../services/games.js";
import { bggErrorResponse } from "../services/bgg.js";
import { decideSession } from "../services/pick.js";
import { roundContext, votingMethodFor } from "../voting/index.js";
import { publish } from "../services/live.js";

/**
 * Per-session game selection: nominate games, then eliminate the least-wanted
 * round by round until the session's game count remains, then decide.
 */
const router = new Hono<{ Variables: AuthVariables }>();
router.use("*", requireAuth);

function getSlot(slotId: number) {
  return db.select().from(slots).where(eq(slots.id, slotId)).get();
}

/**
 * Every successful write in here changes what the other voters should be
 * seeing, so tell them once the handler is done. Doing it as middleware rather
 * than a call in each handler means a new route can't quietly forget to.
 *
 * The slot id comes from the path because `c.req.param()` has no route params
 * in a middleware matched on "*".
 */
router.use("*", async (c, next) => {
  await next();
  if (c.req.method === "GET" || c.res.status >= 400) return;
  const slotId = Number(/\/slots\/(\d+)/.exec(c.req.path)?.[1]);
  if (!Number.isFinite(slotId)) return;
  const slot = getSlot(slotId);
  if (slot) publish(slot.eventId);
});

function remainingNominations(slotId: number) {
  return db
    .select()
    .from(nominations)
    .where(and(eq(nominations.slotId, slotId), isNull(nominations.eliminatedRound)))
    .all();
}

// ---- Nominating ----

router.post("/slots/:slotId/nominations", async (c) => {
  const slotId = Number(c.req.param("slotId"));
  const slot = getSlot(slotId);
  if (!slot) return c.json({ error: "Session not found" }, 404);
  if (slot.pickState !== "nominating") {
    return c.json({ error: "Nominations are closed for this session" }, 409);
  }

  const body = await c.req.json<{ gameId?: number; bggId?: number; game?: GameInput }>();

  let resolvedId: number;
  try {
    resolvedId = await resolveGameId(body, c.get("user")!.id);
  } catch (err) {
    if (err instanceof UnknownGameError) return c.json({ error: err.message }, 400);
    console.error("Nomination lookup failed:", err);
    const { status, body: errBody } = bggErrorResponse(err);
    return c.json(errBody, status);
  }

  // Picking an expansion nominates the base game with the expansion attached.
  const { baseGameId, expansionGameId } = asBaseAndExpansion(resolvedId);

  db.insert(nominations)
    .values({ slotId, gameId: baseGameId, nominatedBy: c.get("user")!.id })
    .onConflictDoNothing()
    .run();
  if (expansionGameId != null) {
    db.insert(nominationExpansions)
      .values({ slotId, gameId: baseGameId, expansionGameId })
      .onConflictDoNothing()
      .run();
  }
  return c.json({ gameId: baseGameId, expansionGameId }, 201);
});

/** Attach or detach an expansion on an existing nomination. */
router.put("/slots/:slotId/nominations/:gameId/expansions/:expansionGameId", (c) => {
  const slotId = Number(c.req.param("slotId"));
  const gameId = Number(c.req.param("gameId"));
  const expansionGameId = Number(c.req.param("expansionGameId"));
  const slot = getSlot(slotId);
  if (!slot) return c.json({ error: "Session not found" }, 404);
  if (slot.pickState !== "nominating") {
    return c.json({ error: "Nominations are closed for this session" }, 409);
  }
  db.insert(nominationExpansions)
    .values({ slotId, gameId, expansionGameId })
    .onConflictDoNothing()
    .run();
  return c.json({ ok: true });
});

router.delete("/slots/:slotId/nominations/:gameId/expansions/:expansionGameId", (c) => {
  const slotId = Number(c.req.param("slotId"));
  const gameId = Number(c.req.param("gameId"));
  const expansionGameId = Number(c.req.param("expansionGameId"));
  db.delete(nominationExpansions)
    .where(
      and(
        eq(nominationExpansions.slotId, slotId),
        eq(nominationExpansions.gameId, gameId),
        eq(nominationExpansions.expansionGameId, expansionGameId),
      ),
    )
    .run();
  return c.json({ ok: true });
});

/**
 * Withdraw a nomination. Yours to withdraw, or an admin's to overrule —
 * somebody else pulling your game while you are still arguing for it is how a
 * pick turns into a row.
 */
router.delete("/slots/:slotId/nominations/:gameId", (c) => {
  const slotId = Number(c.req.param("slotId"));
  const gameId = Number(c.req.param("gameId"));
  const slot = getSlot(slotId);
  if (!slot) return c.json({ error: "Session not found" }, 404);
  if (slot.pickState !== "nominating") {
    return c.json({ error: "Nominations are closed for this session" }, 409);
  }

  const nomination = db
    .select()
    .from(nominations)
    .where(and(eq(nominations.slotId, slotId), eq(nominations.gameId, gameId)))
    .get();
  if (!nomination) return c.json({ error: "That game isn't nominated for this session" }, 404);

  const user = c.get("user")!;
  if (nomination.nominatedBy !== user.id && !isAdminEmail(user.email)) {
    return c.json({ error: "Only whoever nominated it (or an admin) can remove it" }, 403);
  }

  db.delete(nominations)
    .where(and(eq(nominations.slotId, slotId), eq(nominations.gameId, gameId)))
    .run();
  return c.json({ ok: true });
});

// ---- Interest: who would actually sit down to this? ----

/**
 * Set ("up"/"down") or clear (null) the current user's stance on a nominated
 * game.
 *
 * This is not a vote: approvals are capped and decide *which* games survive,
 * while this is uncapped and says who would play what — which is what you need
 * when a session runs two tables and somebody has to work out who goes where.
 * The one place it reaches the elimination is as a tie-breaker, and only where
 * the voting method says so (see `server/src/voting/`). The client sends the
 * stance it wants rather than a toggle, so two quick taps can't race into a
 * state nobody chose.
 */
router.put("/slots/:slotId/interest", async (c) => {
  const slotId = Number(c.req.param("slotId"));
  const slot = getSlot(slotId);
  if (!slot) return c.json({ error: "Session not found" }, 404);
  if (slot.pickState === "decided") {
    return c.json({ error: "This session is already decided" }, 409);
  }

  const { gameId, stance } = await c.req.json<{
    gameId?: number;
    stance?: "up" | "down" | null;
  }>();
  if (gameId == null) return c.json({ error: "gameId required" }, 400);
  if (stance !== "up" && stance !== "down" && stance !== null) {
    return c.json({ error: 'stance must be "up", "down" or null' }, 400);
  }

  const nominated = db
    .select()
    .from(nominations)
    .where(and(eq(nominations.slotId, slotId), eq(nominations.gameId, gameId)))
    .get();
  if (!nominated) return c.json({ error: "That game isn't nominated for this session" }, 400);

  const userId = c.get("user")!.id;
  const mine = and(
    eq(nominationInterest.slotId, slotId),
    eq(nominationInterest.gameId, gameId),
    eq(nominationInterest.userId, userId),
  );

  if (stance === null) {
    db.delete(nominationInterest).where(mine).run();
    return c.json({ stance: null });
  }

  db.insert(nominationInterest)
    .values({ slotId, gameId, userId, stance })
    .onConflictDoUpdate({
      target: [nominationInterest.slotId, nominationInterest.gameId, nominationInterest.userId],
      set: { stance },
    })
    .run();
  return c.json({ stance });
});

// ---- Start the elimination ----

router.post("/slots/:slotId/start", (c) => {
  const slotId = Number(c.req.param("slotId"));
  const slot = getSlot(slotId);
  if (!slot) return c.json({ error: "Session not found" }, 404);
  if (slot.pickState !== "nominating") {
    return c.json({ error: "Already started" }, 409);
  }

  const count = remainingNominations(slotId).length;
  if (count === 0) return c.json({ error: "Nominate at least one game first" }, 400);

  if (count <= slot.gameCount) {
    // Nothing to whittle — lock it in.
    decideSession(slotId);
  } else {
    db.update(slots).set({ pickState: "eliminating", pickRound: 1 }).where(eq(slots.id, slotId)).run();
  }
  return c.json({ ok: true });
});

// ---- Voting: the session's method sets the ballot and decides each round ----

/** Toggle the current user's approval of a game for the current round. */
router.put("/slots/:slotId/approve", async (c) => {
  const slotId = Number(c.req.param("slotId"));
  const slot = getSlot(slotId);
  if (!slot) return c.json({ error: "Session not found" }, 404);
  if (slot.pickState !== "eliminating") {
    return c.json({ error: "This session isn't in a voting round" }, 409);
  }

  const ballot = votingMethodFor(slot).ballot(roundContext(slot));
  if (ballot.kind !== "approval") {
    return c.json({ error: "This session doesn't vote by approval" }, 409);
  }

  const { gameId } = await c.req.json<{ gameId?: number }>();
  if (gameId == null) return c.json({ error: "gameId required" }, 400);
  if (!remainingNominations(slotId).some((n) => n.gameId === gameId)) {
    return c.json({ error: "That game is no longer in the running" }, 400);
  }

  const userId = c.get("user")!.id;
  const mine = db
    .select()
    .from(approvals)
    .where(and(eq(approvals.slotId, slotId), eq(approvals.round, slot.pickRound), eq(approvals.userId, userId)))
    .all();

  const existing = mine.find((a) => a.gameId === gameId);
  if (existing) {
    db.delete(approvals)
      .where(
        and(
          eq(approvals.slotId, slotId),
          eq(approvals.round, slot.pickRound),
          eq(approvals.userId, userId),
          eq(approvals.gameId, gameId),
        ),
      )
      .run();
    return c.json({ approved: false });
  }

  // The allowance can't move mid-round (nothing is eliminated until the round
  // advances), so approvals already cast never exceed it.
  if (mine.length >= ballot.maxApprovals) {
    const n = ballot.maxApprovals;
    return c.json({ error: `You can approve ${n} game${n === 1 ? "" : "s"} this round` }, 400);
  }
  db.insert(approvals)
    .values({ slotId, round: slot.pickRound, userId, gameId })
    .onConflictDoNothing()
    .run();
  return c.json({ approved: true });
});

router.post("/slots/:slotId/advance", (c) => {
  const slotId = Number(c.req.param("slotId"));
  const slot = getSlot(slotId);
  if (!slot) return c.json({ error: "Session not found" }, 404);
  if (slot.pickState !== "eliminating") {
    return c.json({ error: "This session isn't in a voting round" }, 409);
  }

  const ctx = roundContext(slot);
  const plan = votingMethodFor(slot).plan(ctx);
  if (plan.outcome === "waiting") {
    return c.json({ error: "Nobody has voted this round yet." }, 409);
  }
  if (plan.outcome === "tie") {
    return c.json({ error: "Tied on votes and fist bumps at the cut line — vote again." }, 409);
  }

  for (const gameId of plan.gameIds) {
    db.update(nominations)
      .set({ eliminatedRound: slot.pickRound })
      .where(and(eq(nominations.slotId, slotId), eq(nominations.gameId, gameId)))
      .run();
  }

  if (ctx.contenders.length - plan.gameIds.length <= slot.gameCount) {
    decideSession(slotId);
  } else {
    db.update(slots).set({ pickRound: slot.pickRound + 1 }).where(eq(slots.id, slotId)).run();
  }
  return c.json({ ok: true, eliminated: plan.gameIds, decidedBy: plan.decidedBy });
});

// ---- Reopen (undo a decision / restart nominating) ----

router.post("/slots/:slotId/reopen", (c) => {
  const slotId = Number(c.req.param("slotId"));
  const slot = getSlot(slotId);
  if (!slot) return c.json({ error: "Session not found" }, 404);

  db.delete(approvals).where(eq(approvals.slotId, slotId)).run();
  db.delete(plays).where(eq(plays.slotId, slotId)).run();
  db.update(nominations)
    .set({ eliminatedRound: null })
    .where(eq(nominations.slotId, slotId))
    .run();
  db.update(slots)
    .set({ pickState: "nominating", pickRound: 0 })
    .where(eq(slots.id, slotId))
    .run();
  return c.json({ ok: true });
});

export default router;
