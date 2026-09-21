import { Hono } from "hono";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  events,
  eventAttendees,
  eventAvailableGames,
  slots,
  games,
  nominations,
  nominationExpansions,
  nominationInterest,
  approvals,
  plays,
  playPlayers,
  playExpansions,
  users,
} from "../db/schema.js";
import { streamSSE } from "hono/streaming";
import { requireAuth, requireAdmin, type AuthVariables } from "../auth/middleware.js";
import { createEvent, eachDay } from "../services/events.js";
import { activeUserIds } from "../services/users.js";
import { effectivePlayerRange } from "../services/games.js";
import { publish, subscribe } from "../services/live.js";

const router = new Hono<{ Variables: AuthVariables }>();
router.use("*", requireAuth);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

router.get("/", (c) => {
  const rows = db.select().from(events).orderBy(desc(events.startDate)).all();
  const attendeeRows = db.select().from(eventAttendees).all();
  return c.json({
    events: rows.map((e) => ({
      ...e,
      attendeeCount: attendeeRows.filter((a) => a.eventId === e.id).length,
    })),
  });
});

router.post("/", async (c) => {
  const body = await c.req.json<{ name?: string; startDate?: string; endDate?: string }>();
  const { name, startDate, endDate } = body;
  if (!name?.trim() || !ISO_DATE.test(startDate ?? "") || !ISO_DATE.test(endDate ?? "")) {
    return c.json({ error: "name, startDate and endDate (YYYY-MM-DD) are required" }, 400);
  }
  if (endDate! < startDate!) {
    return c.json({ error: "endDate must not be before startDate" }, 400);
  }
  const event = createEvent({
    name: name.trim(),
    startDate: startDate!,
    endDate: endDate!,
    createdBy: c.get("user")!.id,
    // Everyone with access attends by default; editable on the event page.
    attendeeIds: activeUserIds(),
  });
  return c.json({ event }, 201);
});

/**
 * Live updates while people are voting: an SSE stream that says "this event
 * changed", so the page can refetch the bundle instead of waiting for whoever
 * is looking at it to reload.
 *
 * No payload — see services/live.ts. EventSource reconnects on its own, so a
 * dropped connection or a server restart heals without any client-side retry
 * logic; a `retry` hint tells it how soon to try.
 */
router.get("/:id/stream", (c) => {
  const id = Number(c.req.param("id"));
  const event = db.select().from(events).where(eq(events.id, id)).get();
  if (!event) return c.json({ error: "Not found" }, 404);

  // Proxies are the usual reason SSE silently never arrives: any of them may
  // buffer a response that never ends. These ask them not to.
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");

  return streamSSE(c, async (stream) => {
    let unsubscribe: (() => void) | undefined;
    stream.onAbort(() => unsubscribe?.());

    unsubscribe = subscribe(id, () => {
      // Fire-and-forget: a write to a stream that just died must not throw
      // into publish() and stop the other watchers being told.
      void stream.writeSSE({ event: "changed", data: String(Date.now()) }).catch(() => {});
    });

    await stream.writeSSE({ event: "ready", data: String(id), retry: 3000 });

    // A comment every 25s keeps idle-connection timeouts from closing the
    // stream mid-vote. Ends as soon as the client goes away.
    while (!stream.aborted && !stream.closed) {
      await stream.sleep(25_000);
      if (stream.aborted || stream.closed) break;
      await stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
    }

    unsubscribe();
  });
});

/** Full bundle for the event page: sessions, attendees, nominations, votes, plays. */
router.get("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const event = db.select().from(events).where(eq(events.id, id)).get();
  if (!event) return c.json({ error: "Not found" }, 404);

  const slotRows = db
    .select()
    .from(slots)
    .where(eq(slots.eventId, id))
    .orderBy(slots.day, slots.sortOrder)
    .all();
  const slotIds = slotRows.map((s) => s.id);

  const availableGameIds = db
    .select({ gameId: eventAvailableGames.gameId })
    .from(eventAvailableGames)
    .where(eq(eventAvailableGames.eventId, id))
    .all()
    .map((r) => r.gameId);

  const attendees = db
    .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
    .from(eventAttendees)
    .innerJoin(users, eq(eventAttendees.userId, users.id))
    .where(eq(eventAttendees.eventId, id))
    .all();

  const nominationRows = slotIds.length
    ? db.select().from(nominations).where(inArray(nominations.slotId, slotIds)).all()
    : [];

  // Only the current round's approvals matter for the UI.
  const allApprovals = slotIds.length
    ? db.select().from(approvals).where(inArray(approvals.slotId, slotIds)).all()
    : [];
  const roundBySlot = new Map(slotRows.map((s) => [s.id, s.pickRound]));
  const currentApprovals = allApprovals.filter((a) => roundBySlot.get(a.slotId) === a.round);

  const nominationExpansionRows = slotIds.length
    ? db
        .select()
        .from(nominationExpansions)
        .where(inArray(nominationExpansions.slotId, slotIds))
        .all()
    : [];

  // Uncapped "I'd play that" / "not that one" stances. Unlike approvals these
  // aren't per-round, so they all come through as-is.
  const interestRows = slotIds.length
    ? db.select().from(nominationInterest).where(inArray(nominationInterest.slotId, slotIds)).all()
    : [];

  const playRows = slotIds.length
    ? db.select().from(plays).where(inArray(plays.slotId, slotIds)).all()
    : [];
  const playIds = playRows.map((p) => p.id);
  const playPlayerRows = playIds.length
    ? db.select().from(playPlayers).where(inArray(playPlayers.playId, playIds)).all()
    : [];
  const playExpansionRows = playIds.length
    ? db.select().from(playExpansions).where(inArray(playExpansions.playId, playIds)).all()
    : [];

  // Every game referenced anywhere in this event, so the client can look up by id.
  const referencedIds = [
    ...new Set([
      ...nominationRows.map((n) => n.gameId),
      ...playRows.map((p) => p.gameId),
      ...nominationExpansionRows.map((e) => e.expansionGameId),
      ...playExpansionRows.map((e) => e.expansionGameId),
    ]),
  ];
  const gameRows = referencedIds.length
    ? db.select().from(games).where(inArray(games.id, referencedIds)).all()
    : [];

  return c.json({
    event,
    slots: slotRows,
    attendees,
    // Empty means "no shortlist" — the picker then offers the whole library.
    availableGameIds,
    games: gameRows,
    nominations: nominationRows.map((n) => ({
      slotId: n.slotId,
      gameId: n.gameId,
      nominatedBy: n.nominatedBy,
      eliminatedRound: n.eliminatedRound,
      ...(() => {
        const expansionGameIds = nominationExpansionRows
          .filter((e) => e.slotId === n.slotId && e.gameId === n.gameId)
          .map((e) => e.expansionGameId);
        // Player range for the game *as nominated* — expansions included.
        return { expansionGameIds, ...effectivePlayerRange(n.gameId, expansionGameIds) };
      })(),
    })),
    approvals: currentApprovals.map((a) => ({
      slotId: a.slotId,
      userId: a.userId,
      gameId: a.gameId,
    })),
    interest: interestRows.map((i) => ({
      slotId: i.slotId,
      gameId: i.gameId,
      userId: i.userId,
      stance: i.stance,
    })),
    plays: playRows.map((p) => {
      const expansionGameIds = playExpansionRows
        .filter((e) => e.playId === p.id)
        .map((e) => e.expansionGameId);
      // Finishing order when someone recorded a result; otherwise just the
      // seated players, kept in a stable order so the list doesn't shuffle
      // between requests.
      const seated = playPlayerRows
        .filter((pp) => pp.playId === p.id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.userId - b.userId);
      return {
        ...p,
        playerIds: seated.map((pp) => pp.userId),
        ranked: seated.length > 0 && seated.every((pp) => pp.position != null),
        expansionGameIds,
        ...effectivePlayerRange(p.gameId, expansionGameIds),
      };
    }),
  });
});

router.put("/:id/attendees", async (c) => {
  const id = Number(c.req.param("id"));
  const { userIds } = await c.req.json<{ userIds?: number[] }>();
  if (!Array.isArray(userIds)) return c.json({ error: "userIds array required" }, 400);

  // Ignore anyone who no longer has access, so removed users can't be re-added.
  const allowed = new Set(activeUserIds());
  const attendeeIds = [...new Set(userIds)].filter((uid) => allowed.has(uid));

  db.delete(eventAttendees).where(eq(eventAttendees.eventId, id)).run();
  if (attendeeIds.length > 0) {
    db.insert(eventAttendees)
      .values(attendeeIds.map((userId) => ({ eventId: id, userId })))
      .run();
  }
  return c.json({ ok: true, attendeeIds });
});

/**
 * Set which games were brought to this weekend. An empty list clears the
 * shortlist, which puts the picker back to offering the whole library — that's
 * "no restriction", not "nothing allowed".
 */
router.put("/:id/games", async (c) => {
  const id = Number(c.req.param("id"));
  const event = db.select().from(events).where(eq(events.id, id)).get();
  if (!event) return c.json({ error: "Not found" }, 404);

  const { gameIds } = await c.req.json<{ gameIds?: number[] }>();
  if (!Array.isArray(gameIds)) return c.json({ error: "gameIds array required" }, 400);

  // Drop ids that aren't real games, so a stale client can't leave rows behind
  // that the picker would silently never match.
  const known = new Set(db.select({ id: games.id }).from(games).all().map((g) => g.id));
  const wanted = [...new Set(gameIds)].filter((gid) => known.has(gid));

  db.delete(eventAvailableGames).where(eq(eventAvailableGames.eventId, id)).run();
  if (wanted.length > 0) {
    db.insert(eventAvailableGames)
      .values(wanted.map((gameId) => ({ eventId: id, gameId })))
      .run();
  }

  publish(id);
  return c.json({ ok: true, gameIds: wanted });
});

// ---- Session (slot) management ----

function clampGameCount(n: unknown): number {
  return Math.max(1, Math.min(2, Math.round(Number(n) || 1)));
}

router.post("/:id/slots", async (c) => {
  const id = Number(c.req.param("id"));
  const event = db.select().from(events).where(eq(events.id, id)).get();
  if (!event) return c.json({ error: "Event not found" }, 404);

  const { day, label, gameCount } = await c.req.json<{
    day?: string;
    label?: string;
    gameCount?: number;
  }>();
  if (!ISO_DATE.test(day ?? "") || !label?.trim()) {
    return c.json({ error: "day (YYYY-MM-DD) and label required" }, 400);
  }
  if (!eachDay(event.startDate, event.endDate).includes(day!)) {
    return c.json({ error: "day is outside the event's dates" }, 400);
  }
  const maxSort = db
    .select()
    .from(slots)
    .where(eq(slots.eventId, id))
    .all()
    .filter((s) => s.day === day)
    .reduce((m, s) => Math.max(m, s.sortOrder), -1);
  const slot = db
    .insert(slots)
    .values({
      eventId: id,
      day: day!,
      label: label.trim(),
      gameCount: clampGameCount(gameCount),
      sortOrder: maxSort + 1,
    })
    .returning()
    .get();
  return c.json({ slot }, 201);
});

router.patch("/:id/slots/:slotId", async (c) => {
  const slotId = Number(c.req.param("slotId"));
  const { label, gameCount } = await c.req.json<{ label?: string; gameCount?: number }>();
  const set: { label?: string; gameCount?: number } = {};
  if (label !== undefined) {
    if (!label.trim()) return c.json({ error: "label cannot be empty" }, 400);
    set.label = label.trim();
  }
  if (gameCount !== undefined) set.gameCount = clampGameCount(gameCount);
  if (Object.keys(set).length === 0) return c.json({ error: "nothing to update" }, 400);
  db.update(slots).set(set).where(eq(slots.id, slotId)).run();
  return c.json({ ok: true });
});

router.delete("/:id/slots/:slotId", (c) => {
  const slotId = Number(c.req.param("slotId"));
  db.delete(slots).where(eq(slots.id, slotId)).run();
  return c.json({ ok: true });
});

/**
 * Delete a weekend and everything recorded against it. Admins only.
 *
 * The sessions, nominations, approvals and plays go with it: `slots.event_id`
 * and `event_attendees.event_id` are declared ON DELETE CASCADE and everything
 * below a slot cascades from there, so this is one statement rather than a
 * hand-rolled teardown that could miss a table. The shared game library is
 * untouched — games outlive the weekends they were played at.
 *
 * This is a real delete, not the soft `deactivatedAt` used for users (which
 * exists only because users can't be hard-deleted). There's no undo, so the UI
 * spells out what's about to go.
 */
router.delete("/:id", requireAdmin, (c) => {
  const id = Number(c.req.param("id"));
  const event = db.select().from(events).where(eq(events.id, id)).get();
  if (!event) return c.json({ error: "Not found" }, 404);

  db.delete(events).where(eq(events.id, id)).run();

  // Anyone still looking at this weekend should find out now, not on reload.
  publish(id);
  return c.json({ ok: true });
});

export default router;
