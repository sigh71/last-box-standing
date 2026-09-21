/**
 * Dev-only seed: fake users, a sample event with two sessions, and a library of
 * games nominated into those sessions so the nominate/eliminate flow is testable
 * without six real Google logins.
 *
 * Run with: npm run db:seed
 */
import { eq } from "drizzle-orm";
import { isProd } from "../env.js";
import { db } from "./index.js";
import { runMigrations } from "./migrate.js";
import { users, games, nominations, slots, copies } from "./schema.js";
import { createEvent } from "../services/events.js";

if (isProd) {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

runMigrations();

const FAKE_USERS = [
  { googleId: "seed-alice", email: "alice@example.com", name: "Alice" },
  { googleId: "seed-bob", email: "bob@example.com", name: "Bob" },
  { googleId: "seed-carol", email: "carol@example.com", name: "Carol" },
  { googleId: "seed-dave", email: "dave@example.com", name: "Dave" },
  { googleId: "seed-erin", email: "erin@example.com", name: "Erin" },
];

const SEED_GAMES = [
  { title: "Brass: Birmingham", bggId: 224517, minPlayers: 2, maxPlayers: 4, playtimeMinutes: 120, length: "long" as const },
  { title: "Twilight Imperium: Fourth Edition", bggId: 233078, minPlayers: 3, maxPlayers: 6, playtimeMinutes: 480, length: "long" as const },
  { title: "Root", bggId: 237182, minPlayers: 2, maxPlayers: 4, playtimeMinutes: 90, length: "long" as const },
  { title: "Terraforming Mars", bggId: 167791, minPlayers: 1, maxPlayers: 5, playtimeMinutes: 120, length: "long" as const },
  { title: "7 Wonders", bggId: 68448, minPlayers: 2, maxPlayers: 7, playtimeMinutes: 30, length: "short" as const },
  { title: "Codenames", bggId: 178900, minPlayers: 2, maxPlayers: 8, playtimeMinutes: 15, length: "short" as const },
];

for (const fake of FAKE_USERS) {
  db.insert(users).values(fake).onConflictDoNothing().run();
}

// Added by an admin but never signed in (null googleId) — exercises the
// "Not signed in yet" state on the Users page.
db.insert(users)
  .values({ email: "frank@example.com", name: "Frank", addedBy: 1 })
  .onConflictDoNothing()
  .run();

const allUsers = db.select().from(users).all();
const me = allUsers[0]!;
const six = allUsers.slice(0, 6);

const now = new Date();
const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
const friday = new Date(now);
friday.setDate(now.getDate() + daysUntilFriday);
const monday = new Date(friday);
monday.setDate(friday.getDate() + 3);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const event = createEvent({
  name: `Seed Weekend ${iso(friday)}`,
  startDate: iso(friday),
  endDate: iso(monday),
  createdBy: me.id,
  attendeeIds: six.map((u) => u.id),
});

const saturday = new Date(friday);
saturday.setDate(friday.getDate() + 1);
const [friEvening, satAfternoon] = db
  .insert(slots)
  .values([
    { eventId: event.id, day: iso(friday), label: "Friday evening", gameCount: 2, sortOrder: 0 },
    { eventId: event.id, day: iso(saturday), label: "Saturday afternoon", gameCount: 1, sortOrder: 0 },
  ])
  .returning()
  .all();

// Reuse library entries across seed runs — bgg_id is unique, so re-inserting
// would throw (and used to quietly pile up duplicates).
const gameIds = SEED_GAMES.map((g) => {
  const existing = db.select().from(games).where(eq(games.bggId, g.bggId)).get();
  return existing?.id ?? db.insert(games).values({ ...g, addedBy: me.id }).returning().get().id;
});

// A couple of physical copies so the library page isn't empty: one owned by a
// member and lent out, one belonging to the group.
if (db.select().from(copies).all().length === 0) {
  db.insert(copies)
    .values([
      { gameId: gameIds[0]!, ownerKind: "member", ownerUserId: six[1]!.id, holderUserId: six[2]!.id },
      { gameId: gameIds[5]!, ownerKind: "group", holderUserId: six[0]!.id },
    ])
    .run();
}

// Nominate every game to the 2-game Friday session, spread across nominators.
gameIds.forEach((gameId, i) =>
  db
    .insert(nominations)
    .values({ slotId: friEvening!.id, gameId, nominatedBy: six[i % six.length]!.id })
    .onConflictDoNothing()
    .run(),
);
// A smaller field of short-ish games for the 1-game Saturday session.
[gameIds[4]!, gameIds[5]!, gameIds[3]!].forEach((gameId, i) =>
  db
    .insert(nominations)
    .values({ slotId: satAfternoon!.id, gameId, nominatedBy: six[i % six.length]!.id })
    .onConflictDoNothing()
    .run(),
);

console.log(
  `Seeded: ${FAKE_USERS.length} fake users, event "${event.name}" (#${event.id}), ` +
    `2 sessions, ${SEED_GAMES.length} games nominated.`,
);
