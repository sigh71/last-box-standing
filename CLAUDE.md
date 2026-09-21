# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web app for planning a board-game weekend (Fri–Mon) for ~6 friends:
create a weekend, add **sessions** to its days, and let the group pick which
games get played in each session by nominating and voting.

## Commands

```bash
npm install          # npm workspaces monorepo: client + server
npm run dev          # Vite on :5173 (browse this), Hono API on :3000
npm run typecheck    # both workspaces — the main correctness gate
npm run build        # client only; the server runs from TS via tsx
npm run db:generate  # after editing server/src/db/schema.ts (see gotchas)
npm run db:migrate   # apply migrations (also runs on server startup)
npm run db:seed      # dev-only: fake users, an event, sessions, nominations
```

There is **no test framework** in this project. `npm run typecheck` is the only
automated gate, so **check its exit code** — piping it through `tail` can hide a
failure and let a broken commit reach CI. The root script chains the workspaces
with `&&`, so a client failure means the server never runs.

## Architecture

**Vite React SPA + Hono API, one process in production.** In dev, Vite serves the
client and proxies `/api/*` to the server. In prod the same Hono server also
serves `client/dist` with an SPA fallback — one container, one port, no CORS.

**Data flow.** The client fetches one bundle per event
(`GET /api/events/:id` → event, slots, attendees, games, nominations, approvals,
plays) and renders everything from it; mutations invalidate the
`["event", id]` TanStack Query key. Adding a field usually means touching the
bundle in `server/src/routes/events.ts` and the `EventBundle` type in
`client/src/lib/api.ts`.

**Live updates while voting** (`server/src/services/live.ts`): the event page
holds an SSE stream (`GET /api/events/:id/stream`) and refetches the bundle when
the server says that event changed. The message carries **no payload** — the
bundle stays the single source of truth. A middleware in `routes/picking.ts`
publishes after every successful non-GET, so a new picking route can't forget
to. Subscribers live in process memory, which is correct for one container per
group and is the thing to revisit if it's ever replicated. The client
(`hooks/useLiveEvent.ts`) treats the server's 25s heartbeat as a liveness check
and reconnects after 60s of silence: a connection can die while still reporting
`OPEN` (a proxy holding the socket after the server restarts), and during a vote
that shows stale counts indefinitely. `/api/health` reports `watchers`.

**Domain model** (`server/src/db/schema.ts`):
`events` → `slots` → `plays` → `playPlayers`, with `games` as a shared library,
`nominations`/`approvals` driving selection, and `eventAttendees` listing who's
coming.

- **`slots` is a "Session" in the UI.** The table can't be called `sessions` —
  that's the auth table. Keep the UI wording as "Session".
- A session's `gameCount` (1 or 2) is how many games it plays. 2 = the group
  splits across two parallel tables.
- **Picking is per session**, a three-phase state machine on
  `slots.pickState`: `nominating` → `eliminating` → `decided`, tracked with
  `pickRound`. Anyone nominates games; the voting in between belongs to the
  session's **voting method**. On reaching `gameCount` it decides and survivors
  become `plays` (`decideSession` in `server/src/services/pick.ts`). Routes are
  in `server/src/routes/picking.ts`; the whole flow renders in
  `client/src/components/SessionCard.tsx`.
- **Voting methods are pluggable — don't assume there's only one**
  (`server/src/voting/`). Each session records its method in
  `slots.votingMethod` (migration 0016), so it keeps the rules it was voted
  under. A method is pure: given a `RoundContext` (each remaining game's votes
  this round and net fist bumps) it returns the round's `Ballot`, a one-line
  `summary`, and a `RoundPlan` — what advancing would cut, a `tie`, or
  `waiting` before anyone has voted. The advance route executes the plan, and
  the bundle sends it to the clients as `slot.voting`, so the phones and the
  TV preview exactly what the server will do. **Clients render the method's
  output rather than knowing rules**: no hard-coded "3", "≤1" or cut counts in
  the UI. `Ballot` is a union on `kind`; approval is the only kind so far, and a
  method with a different ballot (ranking, say) will need its own storage —
  `approvals` only holds approvals. `listVotingMethods()` is there for when
  sessions can choose.
- **Approval elimination** is the method today
  (`voting/approval-elimination.ts`). Each round everyone approves up to
  `min(3, remaining − gameCount)` games, so the allowance falls 3 → 2 → 1 as
  the field narrows. Advancing drops everything on **≤1 approval** (never below
  `gameCount`); if nothing is that low it drops the **single lowest**, so every
  round makes progress. Games tied on votes at the cut line are split by **net
  fist bumps** (bumps − sad faces), and only a tie on both asks for a revote. No
  votes at all is `waiting`: fist bumps never decide a cut on their own.
- **A nomination belongs to whoever made it.** Only the nominator or an admin
  can withdraw one (`DELETE .../nominations/:gameId`, 403 otherwise); the X in
  `SessionCard` hides for everyone else. Somebody else pulling your game while
  you're still arguing for it is how a pick turns into a row. The expansion
  attach/detach routes on a nomination are *not* guarded this way yet.
- **Thumbs are not votes** (`nomination_interest`, migration 0015). A stance of
  `up`/`down` per person per nominated game, uncapped. Approvals decide *which*
  games survive; this answers the different question of who'd actually sit
  down to what, which is what you need when a session runs two tables. The one
  place it touches the elimination is as a **tie-breaker**, and only where the
  voting method says so — it never decides anything while approvals differ.
  Stances can change right up to the press of advance; they're visible to
  everyone, which is what makes that acceptable. Don't let it grow into a
  veto: the `vetoes` table was that idea and migration 0006 dropped it. The
  composite FK to
  `nominations(slot_id, game_id)` is load-bearing — withdraw a nomination and
  the stances cascade with it, so re-nominating starts clean. (Contrast
  `nomination_expansions`, which FKs slots and games separately and so *does*
  leave rows behind when a nomination is deleted.) UI is `InterestButtons.tsx`,
  themed after Rocky in *Project Hail Mary*: "Fist my bump" for yes, "Sad, sad,
  sad" for no, and "Amaze, amaze, amaze!" only when every attendee is in.
- **Big screen mode** (`client/src/pages/BigScreenPage.tsx`, route
  `/events/:id/sessions/:slotId/screen`, outside the layout) is the same
  picking flow projected on a TV while people vote from their phones — same
  bundle, same SSE stream, no second implementation of the rules. The one thing
  it adds is *timing*: the server resolves a whole round in one write, so the
  bundle jumps from "six in the running" to "decided" in a single frame.
  `hooks/useEliminationDirector.ts` therefore keeps a **shown snapshot that
  lags the live one** — it diffs the two, holds the old picture up through
  verdict → cut → drumroll → reveal, and only then adopts the new one. Vote
  counts inside a round are adopted immediately; stale numbers on a wall are
  worse than none. It can also start and advance the session, so nobody has to
  pick their phone back up between rounds. When a 2-game session decides, the
  winners' board carries the people who **fist-bumped** each game underneath
  it — the split across the two tables is the one question the reveal leaves
  open, and answering it off the TV beats six people re-reading their phones.
  Those come off the live bundle, not the director's lagging snapshot: by then
  the picture has settled, and a bump landing mid-argument should show up as
  it's made. A column with nobody in it says "Nobody yet" rather than
  disappearing — that's information. `styles/bigscreen.css` must use
  `overflow: clip` (not `hidden`) on the containers: the confetti and light
  rays deliberately overflow, and `hidden` turns that spill into a real
  scrollport that focusing a control button then scrolls the whole
  presentation out of view.
- `server/src/pickers/` is a **dormant** registry for one-shot algorithmic
  strategies (an earlier design). Nothing calls it; leave it or delete it
  deliberately, don't half-wire it.

**Results are opt-in** (`play_players.position`, migration 0013). `position` is
1-based finishing order, or NULL for "nobody recorded a result" — a seated table
is not a result, and stats over past weekends depend on telling those apart. The
bundle returns `playerIds` in position order (falling back to a stable order when
unranked) plus `ranked`, true only when every seated player has a position.
`decideSession` seats a 1-game session's attendees with NULL positions, so
deciding never invents a winner. The dialog's toggle writes positions or clears
them; `SortablePlayers` does the ordering with pointer events (HTML5 drag never
fires on touch, and this gets used on a phone at the table) plus move up/down
buttons as the keyboard path.

**A weekend can shortlist the games it brought** (`event_available_games`,
migration 0014). **No rows means no restriction** — the picker offers the whole
library, which is how it behaved before the table existed; it never means
"nothing allowed". `NominateDialog` checks for a non-empty list and, when there
is one, fetches the whole library rather than the capped typeahead, so a
shortlisted game can't hide behind games that aren't even on offer. BGG search
stays open regardless: the shortlist narrows what's offered, it doesn't police
what can be nominated.

**BoardGameGeek traffic is deliberately minimal — keep it that way.** The
`games` table *is* the details cache: a game is fetched from BGG exactly once,
the first time anyone nominates it, and never again. So:
- Nominations send `gameId` (already in the library) or `bggId`; the server
  (`services/games.ts` → `resolveGameId`) reuses the stored row and only calls
  `fetchBggGame` for a genuinely unknown `bggId`. Don't reintroduce a
  client-side "fetch details then submit" round trip.
- `games.bggId` is **unique** — one library row per BGG game.
- Title searches hit `GET /api/games?q=` (the group's own library, no BGG)
  before the BGG search, and BGG search results are cached in the
  `bgg_search_cache` table. Caching in memory is not enough: every deploy
  restarts the container.
- **Ownership belongs to a `copies` row, never to `games`.** `games` is the
  definition (one row per BGG game); a `copy` is a physical box someone owns.
  Several people can own copies of the same title, each with its own owner
  (a member **or** the group — `ownerUserId` is forced null unless `ownerKind`
  is `member`), its own holder (who physically has it, often not the owner),
  and its own expansions in `copy_expansions`.

**Expansions are played *with* a base game, never instead of it.** `games`
carries `bggType` and `baseGameId` (BGG's `thing` response marks an expansion's
base with an `inbound="true"` link). Nominating an expansion nominates its
**base game** with the expansion attached — `asBaseAndExpansion` in
`services/games.ts` — so "Ark Nova + Marine Worlds" is one candidate in the
vote, not two. Attachments live in `nomination_expansions` and are copied to
`play_expansions` when a session is decided.

**Player counts are computed, not read off the game.** `effectivePlayerRange`
in `services/games.ts` widens the base game's range by every expansion included
— some add a player, some add a solo mode — and it's what the API returns for a
copy, a nomination and a play. Read those, not `game.minPlayers`, wherever
expansions are in play. (The long/short split still comes from the base game.)

**People are called by their first name** (`client/src/lib/names.ts`). Six
friends planning a weekend, not a staff directory: `firstName()` is the default
for anything that labels a person — bylines, chips, pickers, the header, the big
screen. Two places keep the whole name deliberately, via `fullName()`: every
avatar's hover title, which is what tells two Simons apart, and the admin user
list at `/users`, where identity is the point. Somebody an admin added who
hasn't signed in yet has no name at all, so both fall back to the email (the
local part for a first name, the whole address for a full one).

**Auth & access** (`server/src/routes/auth.ts`, `server/src/auth/`):
Google OAuth via `arctic`, opaque session token in an httpOnly cookie with only
its SHA-256 hash stored. `ADMIN_EMAILS` (falls back to the older
`ALLOWED_EMAILS`) names the **admins** — admin status is computed from the email
per request, there is no role column. Admins manage everyone else at `/users`:
adding someone creates a `users` row with a **null `googleId`**, claimed on their
first login (looked up by `googleId`, then by email). Removal is a soft
`deactivatedAt` plus deleting their sessions; hard deletes are impossible because
`events.createdBy`, `games.addedBy` and `nominations.nominatedBy` reference
`users` without cascade.

**Deleting a weekend** (`DELETE /api/events/:id`, `requireAdmin`) *is* a hard
delete — `slots.event_id` and `event_attendees.event_id` cascade, and everything
under a slot cascades from there, so one statement clears the sessions, votes
and plays. The game library is untouched. There's no undo, so the dialog is deliberately
awkward: it counts up what goes with it and makes the admin type `DELETE`.
Recorded plays are the part worth pausing over — they're the only record of what
the group played and who was there. It publishes to `services/live.ts` too: a 404 on refetch
keeps the last good bundle in the query cache, so the event page checks the
error (`ApiError.status`) rather than just `!bundle`, or a reader would sit on a
page that no longer exists.

## Gotchas

**Env lives in one file: `.env` at the repo root** (git-ignored), used by both dev
and prod (docker compose reads the same file on the VM). The server loads it via
`tsx --env-file-if-exists=../.env`, so **env changes need a full restart** — the
watcher won't pick them up.

**The deployed database is live.** Production holds real data the group is
using, on the `db-data` volume at `/data/app.db`. Every schema change ships as a
Drizzle migration that preserves existing rows: new `NOT NULL` columns need a
default or a backfill, table rebuilds must carry the old rows across, and
data-shape changes are SQL over existing rows (see
`0010_merge_manual_duplicates.sql`) — never a wipe-and-re-add. Nothing in the
deploy path may reset or reseed prod, and `docker compose down -v` is never the
fix. `scripts/backup-db.sh` snapshots the DB before every deploy and aborts the
deploy if it can't.

**Migrations.** `runMigrations()` runs on server startup, so a `tsx watch`
restart applies pending migrations. Three traps, all previously hit:

1. `drizzle-kit generate` **prompts interactively** when it can't tell a new
   table from a rename, and the tooling here has no TTY. Split such changes into
   an additive migration then a drop migration.
2. Changing a column's type/nullability makes SQLite **rebuild the table**, which
   trips foreign keys from referencing tables — drizzle-kit's
   `PRAGMA foreign_keys=OFF` is silently ignored because it sits inside the
   migration transaction. `runMigrations()` toggles the pragma around
   `migrate()` and runs `foreign_key_check` afterwards; keep that.
3. Those generated rebuilds `SELECT` newly-added columns **from the old table**,
   which fails. Hand-edit the `INSERT` to use `NULL` for new columns.

Always read generated SQL before applying it, and check row counts afterwards.

## Verifying changes

`npm run dev`, then **sign in as a seeded user without Google**:
`http://localhost:5173/api/auth/dev-login/:userId` (dev-only route, absent in
production). `npm run db:seed` prints the seeded event id; user 1 is the admin,
2–6 are fake friends. Switching users this way is how to exercise multi-person
flows like voting and permissions.

Prefer driving the real UI in the browser over asserting from types alone —
several bugs here were only visible at runtime.

## Deploying

Push to `main` → GitHub Actions typechecks, builds, then (only when the
`DEPLOY_PATH` repo variable is set) SSHes to the server and runs `git pull`,
`scripts/backup-db.sh` (online SQLite snapshot into `backups/` in the checkout,
last 10 kept), then `docker compose up -d --build`. See the README for setup.
The server's `.env` is **not** in git and survives deploys; changing it needs
`docker compose up -d` to recreate the container. Pull requests run the
typecheck and build only.

**Releases are semver, cut with `npm version <patch|minor|major>` then
`git push --follow-tags`** (README → Releases). The root `package.json` is the
only version: the workspaces deliberately have none, and `/api/health`
reports it. Pushing a `v*.*.*` tag runs `release.yml`, which refuses a tag
that doesn't match `package.json` and publishes a GitHub Release. Deploys
still follow `main`, not tags. Major means a self-hoster has to act by hand
(new required env var, compose change); a migration that applies itself on
startup is minor.
