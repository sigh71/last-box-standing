import { sqliteTable, text, integer, primaryKey, foreignKey } from "drizzle-orm/sqlite-core";

/**
 * A person with access to the app. Admins (see ADMIN_EMAILS) can add users by
 * email before they have ever signed in — those rows have a null `googleId`
 * until their first Google login claims them. Removal is a soft
 * `deactivatedAt` stamp so their name survives on past events.
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  googleId: text("google_id").unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  // Plain column, not an FK: a self-reference complicates the table rebuilds
  // SQLite needs for schema changes, and this is informational only.
  addedBy: integer("added_by"),
  deactivatedAt: integer("deactivated_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  // sha256 hash of the opaque session token held in the client's cookie.
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// ---- Schedule domain ----

/** A board-game weekend (usually Fri–Mon). */
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(), // ISO date, e.g. 2026-08-14
  endDate: text("end_date").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const eventAttendees = sqliteTable(
  "event_attendees",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

/**
 * The games actually brought to a weekend, so the nomination picker can offer
 * what's on the table instead of the whole library.
 *
 * Optional by design: **no rows for an event means every game is allowed**, not
 * that none are. That keeps the feature invisible for weekends nobody bothers
 * to shortlist, and is why the picker checks for an empty list rather than
 * treating this as a filter that always applies.
 *
 * Not named `event_games` — that was the retired event-wide propose/vote design
 * and reusing the name would confuse the two.
 */
export const eventAvailableGames = sqliteTable(
  "event_available_games",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.gameId] })],
);

/**
 * A play session within an event day (surfaced in the UI as a "Session";
 * the table stays `slots` because the auth `sessions` table owns that name).
 * `gameCount` is how many games run in this session: 1 (everyone together) or
 * 2 (split into two parallel tables).
 */
export const slots = sqliteTable("slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  day: text("day").notNull(), // ISO date
  label: text("label").notNull(),
  gameCount: integer("game_count").notNull().default(1),
  // Game selection is a per-session process: nominate -> eliminate -> decided.
  pickState: text("pick_state", {
    enum: ["nominating", "eliminating", "decided"],
  })
    .notNull()
    .default("nominating"),
  pickRound: integer("pick_round").notNull().default(0),
  /**
   * Which voting method decides this session (`server/src/voting/`). Stored
   * per session rather than assumed, so a session keeps the rules it was
   * voted under when other methods arrive. Not an enum: the registry is the
   * list of valid ids, and an unknown one fails loudly there.
   */
  votingMethod: text("voting_method").notNull().default("approval-elimination"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * The group's game library, shared across events. This table is also the cache
 * for BoardGameGeek details: once a game is here we never re-fetch it, so a
 * game is only ever pulled from BGG the first time anyone nominates it.
 */
export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  // Unique so a BGG game can only ever land in the library once.
  bggId: integer("bgg_id").unique(),
  minPlayers: integer("min_players").notNull().default(1),
  maxPlayers: integer("max_players").notNull().default(99),
  playtimeMinutes: integer("playtime_minutes"),
  length: text("length", { enum: ["long", "short"] }).notNull().default("short"),
  thumbnailUrl: text("thumbnail_url"),
  imageUrl: text("image_url"),
  yearPublished: integer("year_published"),
  description: text("description"),
  /** When the BGG details were last pulled; null for manually-entered games. */
  bggFetchedAt: integer("bgg_fetched_at", { mode: "timestamp" }),

  // --- Expansions ---
  /** BGG's own classification. Expansions are played *with* their base game. */
  bggType: text("bgg_type", { enum: ["boardgame", "boardgameexpansion"] })
    .notNull()
    .default("boardgame"),
  /** For an expansion, the library id of the game it expands (if we have it). */
  baseGameId: integer("base_game_id"),

  addedBy: integer("added_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * A physical copy of a game that someone in the group owns. Several people can
 * own copies of the same title, and each copy comes with its own expansions —
 * Alice's Ark Nova might include Marine Worlds while Dave's is the plain box.
 */
export const copies = sqliteTable("copies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** The base game this is a copy of. */
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  /** Who owns it: a member, or the group collectively. */
  ownerKind: text("owner_kind", { enum: ["member", "group"] }),
  /** Set when ownerKind is "member". */
  ownerUserId: integer("owner_user_id"),
  /** Who physically has it right now — often not the owner. */
  holderUserId: integer("holder_user_id"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** The expansions that live in a particular copy's box. */
export const copyExpansions = sqliteTable(
  "copy_expansions",
  {
    copyId: integer("copy_id")
      .notNull()
      .references(() => copies.id, { onDelete: "cascade" }),
    expansionGameId: integer("expansion_game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.copyId, t.expansionGameId] })],
);

/**
 * Persisted BGG *search* results. Title searches can't be answered from the
 * library (they're for games we don't have yet), and an in-memory cache is
 * wiped by every deploy — so they're cached here instead.
 */
export const bggSearchCache = sqliteTable("bgg_search_cache", {
  /** Normalized (trimmed, lowercased) query string. */
  query: text("query").primaryKey(),
  /** JSON array of { bggId, title, year }. */
  results: text("results").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
});

/**
 * A game nominated for a session. `eliminatedRound` is null while the game is
 * still in the running, or the round number in which it was voted out.
 */
export const nominations = sqliteTable(
  "nominations",
  {
    slotId: integer("slot_id")
      .notNull()
      .references(() => slots.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    nominatedBy: integer("nominated_by")
      .notNull()
      .references(() => users.id),
    eliminatedRound: integer("eliminated_round"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.slotId, t.gameId] })],
);

/**
 * Expansions attached to a nomination. A base game plus its expansions is one
 * nomination, voted on and scheduled as a single thing — "Ark Nova + Marine
 * Worlds" is one game night, not two candidates.
 */
export const nominationExpansions = sqliteTable(
  "nomination_expansions",
  {
    slotId: integer("slot_id")
      .notNull()
      .references(() => slots.id, { onDelete: "cascade" }),
    /** The nominated base game. */
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    expansionGameId: integer("expansion_game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.slotId, t.gameId, t.expansionGameId] })],
);

/**
 * "I'd play that" / "not that one" against a nominated game.
 *
 * Deliberately *not* a vote: it changes nothing about the elimination, which
 * stays the strict <= 1 approval rule. Approvals are capped at three per round
 * and answer "which of these should we play"; this is uncapped and answers the
 * different question of who would actually sit down to what — the thing you
 * need when a session splits across two tables and somebody has to decide who
 * goes where. (The retired `vetoes` table was the other idea, where one person
 * could sink a game; this is not that.)
 *
 * The composite foreign key to `nominations` is the point: pull a game out of
 * a session and the stances go with it, so re-nominating it later starts clean
 * rather than resurrecting opinions nobody remembers giving.
 */
export const nominationInterest = sqliteTable(
  "nomination_interest",
  {
    slotId: integer("slot_id").notNull(),
    gameId: integer("game_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stance: text("stance", { enum: ["up", "down"] }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.slotId, t.gameId, t.userId] }),
    foreignKey({
      columns: [t.slotId, t.gameId],
      foreignColumns: [nominations.slotId, nominations.gameId],
    }).onDelete("cascade"),
  ],
);

/** The expansions carried over when a session is decided. */
export const playExpansions = sqliteTable(
  "play_expansions",
  {
    playId: integer("play_id")
      .notNull()
      .references(() => plays.id, { onDelete: "cascade" }),
    expansionGameId: integer("expansion_game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.playId, t.expansionGameId] })],
);

/**
 * Approval votes for an elimination round: each user marks up to 3 games they
 * would play (one row per approved game). Games with <= 1 approval are dropped
 * when the round advances, until the session's game count remains.
 */
export const approvals = sqliteTable(
  "approvals",
  {
    slotId: integer("slot_id")
      .notNull()
      .references(() => slots.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.slotId, t.round, t.userId, t.gameId] })],
);

/**
 * A scheduled game at a table within a slot. Two parallel long games in the
 * same slot = two plays. (Named "plays" because `sessions` is the auth table.)
 */
export const plays = sqliteTable("plays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slotId: integer("slot_id")
    .notNull()
    .references(() => slots.id, { onDelete: "cascade" }),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const playPlayers = sqliteTable(
  "play_players",
  {
    playId: integer("play_id")
      .notNull()
      .references(() => plays.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Finishing position: 1 = won, 2 = runner-up, and so on. NULL means nobody
     * recorded a result — the players were seated but the game wasn't scored.
     * Keep that distinction: "we don't know who won" is not "everybody drew",
     * and stats over past weekends depend on being able to tell them apart.
     */
    position: integer("position"),
  },
  (t) => [primaryKey({ columns: [t.playId, t.userId] })],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Slot = typeof slots.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Copy = typeof copies.$inferSelect;
export type Nomination = typeof nominations.$inferSelect;
export type NominationExpansion = typeof nominationExpansions.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type NominationInterest = typeof nominationInterest.$inferSelect;
export type Play = typeof plays.$inferSelect;
