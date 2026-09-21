import { XMLParser } from "fast-xml-parser";
import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { bggSearchCache } from "../db/schema.js";

/**
 * BoardGameGeek XML API access, kept deliberately sparing — BGG asks for gentle
 * usage and requires a registered app token.
 *
 * Game details are never fetched twice: once a game is in the `games` table it
 * *is* the cache (see services/games.ts). Only searches come through here
 * repeatedly, and those are cached in the database so a deploy doesn't wipe them.
 */

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

/** Game metadata changes rarely; searches can be cached for a long time. */
const SEARCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Thrown when BGG rejects us for missing/invalid app credentials. */
export class BggAuthError extends Error {}

export const BGG_NOT_CONFIGURED_MSG =
  "BoardGameGeek now requires a registered application token. Register a (free, " +
  "non-commercial) app at boardgamegeek.com/applications and set BGG_APP_TOKEN " +
  "in .env — until then, add games manually.";

export function bggErrorResponse(err: unknown) {
  return err instanceof BggAuthError
    ? {
        status: 503 as const,
        body: { error: BGG_NOT_CONFIGURED_MSG, code: "bgg_not_configured" },
      }
    : { status: 502 as const, body: { error: "BGG request failed", code: "bgg_failed" } };
}

function asArray<T>(x: T | T[] | undefined): T[] {
  return x == null ? [] : Array.isArray(x) ? x : [x];
}

async function fetchXml(url: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/xml" };
  if (env.BGG_APP_TOKEN) headers.Authorization = `Bearer ${env.BGG_APP_TOKEN}`;
  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 403) {
    throw new BggAuthError(`BGG responded ${res.status}`);
  }
  if (!res.ok) throw new Error(`BGG responded ${res.status}`);
  return parser.parse(await res.text());
}

export interface BggSearchResult {
  bggId: number;
  title: string;
  year: number | null;
}

/**
 * How many hits to keep. Big families (Munchkin, Risk, Catan) run to dozens of
 * editions and expansions on BGG, and the one you want is rarely in the first
 * twenty — the old cap made those unfindable.
 */
const SEARCH_LIMIT = 150;

/**
 * BGG's search matches titles only, so "munchkin 2011" finds nothing. Pull a
 * trailing four-digit year off the query, search on the title alone, and use
 * the year to filter the results instead.
 */
function splitYear(query: string): { title: string; year: number | null } {
  const m = /^(.*?)[\s,(]+((?:19|20)\d{2})\)?$/.exec(query);
  const title = m?.[1]?.trim();
  const year = m?.[2];
  if (!title || !year) return { title: query, year: null };
  return { title, year: Number(year) };
}

/**
 * Orders hits so the game someone actually typed is at the top: exact title
 * first, then titles starting with the query, then everything else. BGG's own
 * order buries plain "Risk" under its spin-offs.
 */
function rankByQuery(results: BggSearchResult[], title: string): BggSearchResult[] {
  const q = title.trim().toLowerCase();
  if (!q) return results;
  const rank = (r: BggSearchResult) => {
    const t = r.title.toLowerCase();
    if (t === q) return 0;
    if (t.startsWith(`${q}:`) || t.startsWith(`${q} `)) return 1;
    if (t.startsWith(q)) return 2;
    return 3;
  };
  // Stable sort: BGG's relative order is kept inside each band.
  return results
    .map((r, i) => ({ r, i, rank: rank(r) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.r);
}

/** Title search, served from the database cache when possible. */
export async function searchBgg(rawQuery: string): Promise<BggSearchResult[]> {
  const { title, year } = splitYear(rawQuery.trim());
  // Cache under the title alone, so "munchkin" and "munchkin 2011" share one
  // BGG round trip and only differ in how the cached hits are filtered.
  const query = title.toLowerCase();
  const shape = (results: BggSearchResult[]) =>
    rankByQuery(year == null ? results : results.filter((r) => r.year === year), title);

  const cached = db
    .select()
    .from(bggSearchCache)
    .where(eq(bggSearchCache.query, query))
    .get();
  if (cached && Date.now() - cached.fetchedAt.getTime() < SEARCH_TTL_MS) {
    return shape(JSON.parse(cached.results) as BggSearchResult[]);
  }

  const data = (await fetchXml(
    `https://boardgamegeek.com/xmlapi2/search?type=boardgame&query=${encodeURIComponent(title)}`,
  )) as { items?: { item?: unknown } };

  const items = asArray(data.items?.item) as {
    id: string;
    name: { type: string; value: string } | { type: string; value: string }[];
    yearpublished?: { value: string };
  }[];
  const results = items
    .map((it) => {
      const names = asArray(it.name);
      const primary = names.find((n) => n.type === "primary") ?? names[0];
      return {
        bggId: Number(it.id),
        title: primary?.value ?? "Unknown",
        year: it.yearpublished ? Number(it.yearpublished.value) : null,
      };
    })
    .slice(0, SEARCH_LIMIT);

  db.insert(bggSearchCache)
    .values({ query, results: JSON.stringify(results), fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: bggSearchCache.query,
      set: { results: JSON.stringify(results), fetchedAt: new Date() },
    })
    .run();

  return shape(results);
}

export interface BggGameDetails {
  bggId: number;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  playtimeMinutes: number | null;
  length: "long" | "short";
  thumbnailUrl: string | null;
  imageUrl: string | null;
  yearPublished: number | null;
  description: string | null;
  bggType: "boardgame" | "boardgameexpansion";
  /** For an expansion, the BGG id of the game it expands. */
  baseBggId: number | null;
}

/**
 * Full details for one game. Callers must check the library first — this always
 * hits BGG.
 */
export async function fetchBggGame(bggId: number): Promise<BggGameDetails | null> {
  const data = (await fetchXml(`https://boardgamegeek.com/xmlapi2/thing?id=${bggId}`)) as {
    items?: { item?: unknown };
  };
  const item = asArray(data.items?.item)[0] as
    | {
        id: string;
        type?: string;
        thumbnail?: string;
        image?: string;
        description?: string;
        name: { type: string; value: string } | { type: string; value: string }[];
        minplayers?: { value: string };
        maxplayers?: { value: string };
        playingtime?: { value: string };
        yearpublished?: { value: string };
        link?:
          | { type: string; id: string; value: string; inbound?: string }
          | { type: string; id: string; value: string; inbound?: string }[];
      }
    | undefined;
  if (!item) return null;

  const names = asArray(item.name);
  const primary = names.find((n) => n.type === "primary") ?? names[0];
  const playtime = item.playingtime ? Number(item.playingtime.value) : null;

  const isExpansion = item.type === "boardgameexpansion";
  // On an expansion, the *inbound* boardgameexpansion link points at its base
  // game; on a base game those links are its expansions, so ignore them here.
  const baseLink = asArray(item.link).find(
    (l) => l.type === "boardgameexpansion" && l.inbound === "true",
  );

  return {
    bggId: Number(item.id),
    title: primary?.value ?? "Unknown",
    minPlayers: item.minplayers ? Number(item.minplayers.value) : 1,
    maxPlayers: item.maxplayers ? Number(item.maxplayers.value) : 99,
    playtimeMinutes: playtime,
    // Convention for this group: >= 2 hours is a "long" game.
    length: (playtime ?? 0) >= 120 ? "long" : "short",
    thumbnailUrl: item.thumbnail ?? null,
    imageUrl: item.image ?? null,
    yearPublished: item.yearpublished ? Number(item.yearpublished.value) : null,
    description: item.description ?? null,
    bggType: isExpansion ? "boardgameexpansion" : "boardgame",
    baseBggId: isExpansion && baseLink ? Number(baseLink.id) : null,
  };
}
