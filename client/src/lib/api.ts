export interface Me {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

/** A person with access, as shown on the admin Users page. */
export interface AppUser {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** False when an admin added them but they haven't signed in yet. */
  signedIn: boolean;
  deactivatedAt: number | null;
  addedBy: number | null;
}

export interface EventSummary {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  createdBy: number;
  attendeeCount: number;
}

export interface Attendee {
  id: number;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

export type PickState = "nominating" | "eliminating" | "decided";

/** A play session (UI term); one or two games run within it. */
export interface Slot {
  id: number;
  eventId: number;
  day: string;
  label: string;
  gameCount: number;
  pickState: PickState;
  pickRound: number;
  /** Which voting method decides this session; see `server/src/voting/`. */
  votingMethod: string;
  /** The current round, as the voting method sees it; null unless voting. */
  voting: VotingView | null;
  sortOrder: number;
}

/**
 * What a person fills in this round. Switch on `kind`: approval is the only
 * one so far, but a session's voting method decides, so don't assume it.
 */
export type Ballot = { kind: "approval"; maxApprovals: number };

/** What advancing the round would do right now. Mirrors the server's type. */
export type RoundPlan =
  | { outcome: "cut"; gameIds: number[]; decidedBy: "votes" | "interest" }
  | { outcome: "tie"; gameIds: number[] }
  | { outcome: "waiting"; gameIds: number[] };

export interface VotingView {
  method: string;
  ballot: Ballot;
  /** This round's rules in one short line. */
  summary: string;
  plan: RoundPlan;
}

export interface Game {
  id: number;
  title: string;
  bggId: number | null;
  minPlayers: number;
  maxPlayers: number;
  playtimeMinutes: number | null;
  length: "long" | "short";
  thumbnailUrl: string | null;
  imageUrl?: string | null;
  yearPublished?: number | null;
  bggType?: "boardgame" | "boardgameexpansion";
  /** For an expansion, the library id of the game it expands. */
  baseGameId?: number | null;
  /** Physical copies the group owns. Only present on library listings. */
  copies?: Copy[];
}

/**
 * A physical copy someone owns. Several people can own copies of the same
 * title, and each box has its own expansions — which is why the player range
 * lives here rather than on the game.
 */
export interface Copy {
  id: number;
  gameId: number;
  /** A member, the group, or nobody recorded yet. */
  ownerKind: "member" | "group" | null;
  ownerUserId: number | null;
  /** Who physically has it right now — often not the owner. */
  holderUserId: number | null;
  notes: string | null;
  expansionGameIds: number[];
  /** Seats for this box, expansions included. */
  minPlayers: number;
  maxPlayers: number;
}

export interface Nomination {
  slotId: number;
  /** The base game. Expansions ride along in `expansionGameIds`. */
  gameId: number;
  nominatedBy: number;
  /** null while still in the running, else the round it was cut in. */
  eliminatedRound: number | null;
  expansionGameIds: number[];
  /** Seats for the game as nominated, expansions included. */
  minPlayers: number;
  maxPlayers: number;
}

/** A current-round approval: `userId` would play `gameId`. */
export interface Approval {
  slotId: number;
  userId: number;
  gameId: number;
}

/** "I'd play that" / "not that one". */
export type Stance = "up" | "down";

/**
 * Where one person stands on one nominated game. Uncapped, and not a vote —
 * approvals decide which games survive, this says who would actually sit down
 * to them. A voting method may use it to break a tie (`RoundPlan.decidedBy`).
 */
export interface NominationInterest {
  slotId: number;
  gameId: number;
  userId: number;
  stance: Stance;
}

export interface Play {
  id: number;
  slotId: number;
  gameId: number;
  notes: string | null;
  /** Finishing order when `ranked`, otherwise just who was at the table. */
  playerIds: number[];
  /** Whether `playerIds` is a recorded result rather than a seating list. */
  ranked: boolean;
  expansionGameIds: number[];
  /** Seats for the game as scheduled, expansions included. */
  minPlayers: number;
  maxPlayers: number;
}

export interface EventBundle {
  event: { id: number; name: string; startDate: string; endDate: string };
  slots: Slot[];
  attendees: Attendee[];
  /** Games brought to this weekend. Empty means the whole library is allowed. */
  availableGameIds: number[];
  games: Game[];
  nominations: Nomination[];
  approvals: Approval[];
  interest: NominationInterest[];
  plays: Play[];
}

export interface BggSearchResult {
  bggId: number;
  title: string;
  year: number | null;
}

export interface BggGame {
  bggId: number;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  playtimeMinutes: number | null;
  length: "long" | "short";
  thumbnailUrl: string | null;
}

/** Carries the HTTP status, so callers can tell "gone" from "went wrong". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

// ---- Auth ----

export async function fetchMe(): Promise<Me | null> {
  const res = await fetch("/api/me", { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: Me | null };
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export function startGoogleLogin(): void {
  window.location.href = "/api/auth/google";
}

// ---- Events ----

export const listEvents = () =>
  request<{ events: EventSummary[] }>("/api/events").then((r) => r.events);

export const createEvent = (body: { name: string; startDate: string; endDate: string }) =>
  request<{ event: EventSummary }>("/api/events", {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.event);

export const getEvent = (id: number) => request<EventBundle>(`/api/events/${id}`);

/** Admins only. Takes the weekend's sessions, votes and plays with it. */
export const deleteEvent = (id: number) => request(`/api/events/${id}`, { method: "DELETE" });

/** Empty `gameIds` clears the shortlist, allowing the whole library again. */
export const updateAvailableGames = (eventId: number, gameIds: number[]) =>
  request(`/api/events/${eventId}/games`, {
    method: "PUT",
    body: JSON.stringify({ gameIds }),
  });

export const updateAttendees = (eventId: number, userIds: number[]) =>
  request(`/api/events/${eventId}/attendees`, {
    method: "PUT",
    body: JSON.stringify({ userIds }),
  });

// ---- Users (listing is open to members; adding and removing are admin-only) ----

export const listUsers = () =>
  request<{ users: AppUser[] }>("/api/users").then((r) => r.users);

export const addUser = (body: { email: string; name?: string }) =>
  request<{ user: { id: number; email: string }; restored: boolean }>("/api/users", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const removeUser = (id: number) =>
  request(`/api/users/${id}`, { method: "DELETE" });

// ---- Sessions (a.k.a. slots) ----

export const createSession = (
  eventId: number,
  body: { day: string; label: string; gameCount: number },
) =>
  request<{ slot: Slot }>(`/api/events/${eventId}/slots`, {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.slot);

export const updateSession = (
  eventId: number,
  slotId: number,
  body: { label?: string; gameCount?: number },
) =>
  request(`/api/events/${eventId}/slots/${slotId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteSession = (eventId: number, slotId: number) =>
  request(`/api/events/${eventId}/slots/${slotId}`, { method: "DELETE" });

// ---- Picking: nominate -> eliminate -> decide ----

/**
 * Nominate a game. Prefer `gameId` (already in the library) or `bggId` — the
 * server reuses the stored copy and only calls BoardGameGeek for games it has
 * never seen. `game` is for manual entry.
 */
export const nominate = (
  slotId: number,
  body: {
    gameId?: number;
    bggId?: number;
    game?: Partial<BggGame> & { title: string };
  },
) =>
  request(`/api/slots/${slotId}/nominations`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/** Only the nominator or an admin may withdraw a nomination. */
export const removeNomination = (slotId: number, gameId: number) =>
  request(`/api/slots/${slotId}/nominations/${gameId}`, { method: "DELETE" });

/**
 * Set the current user's stance on a nominated game, or pass null to clear it.
 * Sends the wanted stance rather than a toggle, so a double tap can't land
 * somewhere nobody chose.
 */
export const setInterest = (slotId: number, gameId: number, stance: Stance | null) =>
  request<{ stance: Stance | null }>(`/api/slots/${slotId}/interest`, {
    method: "PUT",
    body: JSON.stringify({ gameId, stance }),
  });

export const startPicking = (slotId: number) =>
  request(`/api/slots/${slotId}/start`, { method: "POST" });

/** Toggle the current user's approval of a game in the current round. */
export const toggleApproval = (slotId: number, gameId: number) =>
  request<{ approved: boolean }>(`/api/slots/${slotId}/approve`, {
    method: "PUT",
    body: JSON.stringify({ gameId }),
  });

export const advanceRound = (slotId: number) =>
  request(`/api/slots/${slotId}/advance`, { method: "POST" });

export const reopenSession = (slotId: number) =>
  request(`/api/slots/${slotId}/reopen`, { method: "POST" });

// ---- BGG ----

export const bggSearch = (q: string) =>
  request<{ results: BggSearchResult[] }>(`/api/bgg/search?q=${encodeURIComponent(q)}`).then(
    (r) => r.results,
  );

/** Search the group's own library — no BoardGameGeek traffic. */
/**
 * `limit` defaults to a short typeahead list on the server; pass "all" where a
 * truncated library would be wrong (the Library page, the owned-games check).
 */
export const searchLibrary = (q: string, limit?: number | "all") =>
  request<{ games: Game[] }>(
    `/api/games?q=${encodeURIComponent(q)}${limit != null ? `&limit=${limit}` : ""}`,
  ).then((r) => r.games);

// ---- Library ----

export const addToLibrary = (body: {
  bggId?: number;
  game?: Partial<BggGame> & { title: string };
}) =>
  request<{ gameId: number; existed: boolean }>("/api/games", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const deleteGame = (id: number) => request(`/api/games/${id}`, { method: "DELETE" });

// ---- Copies ----

export const createCopy = (gameId: number) =>
  request<{ copy: Copy }>("/api/copies", {
    method: "POST",
    body: JSON.stringify({ gameId }),
  });

/** Set who owns this copy and who currently has it. */
export const updateCopy = (
  id: number,
  body: {
    ownerKind?: "member" | "group" | null;
    ownerUserId?: number | null;
    holderUserId?: number | null;
    notes?: string | null;
  },
) =>
  request<{ copy: Copy }>(`/api/copies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteCopy = (id: number) => request(`/api/copies/${id}`, { method: "DELETE" });

/** Record that this box does (or no longer does) contain an expansion. */
export const setCopyExpansion = (copyId: number, expansionGameId: number, included: boolean) =>
  request(`/api/copies/${copyId}/expansions/${expansionGameId}`, {
    method: included ? "PUT" : "DELETE",
  });

// ---- Expansions on a nomination ----

export const attachExpansion = (slotId: number, gameId: number, expansionGameId: number) =>
  request(`/api/slots/${slotId}/nominations/${gameId}/expansions/${expansionGameId}`, {
    method: "PUT",
  });

export const detachExpansion = (slotId: number, gameId: number, expansionGameId: number) =>
  request(`/api/slots/${slotId}/nominations/${gameId}/expansions/${expansionGameId}`, {
    method: "DELETE",
  });

// ---- Plays (editing a decided session) ----

export const createPlay = (
  slotId: number,
  body: { gameId: number; playerIds: number[]; ranked?: boolean; notes?: string },
) =>
  request<{ play: Play }>(`/api/slots/${slotId}/plays`, {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.play);

export const updatePlay = (
  playId: number,
  body: { gameId?: number; playerIds?: number[]; ranked?: boolean; notes?: string | null },
) => request(`/api/plays/${playId}`, { method: "PATCH", body: JSON.stringify(body) });

export const deletePlay = (playId: number) =>
  request(`/api/plays/${playId}`, { method: "DELETE" });
