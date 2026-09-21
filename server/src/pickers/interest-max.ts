import type {
  PickerGame,
  PickerInput,
  PickerPlayer,
  PickerStrategy,
  PickerSuggestion,
  SuggestionTable,
} from "./types.js";
import { VOTE_LABELS } from "./types.js";

const PASS_PENALTY = -5; // assigning someone to a game they passed on is bad
const DEFAULT_LEVEL = 1; // no vote recorded -> treat as "Fine"
const BALANCE_WEIGHT = 0.1; // tie-break in favor of evenly sized tables

function level(game: PickerGame, playerId: number): number {
  return game.votes[playerId] ?? DEFAULT_LEVEL;
}

function playerScore(game: PickerGame, playerId: number): number {
  const l = level(game, playerId);
  return l === 0 ? PASS_PENALTY : l;
}

/** All ways to partition `players` into `count` non-empty ordered groups. */
function partitions(players: PickerPlayer[], count: number): PickerPlayer[][][] {
  if (count === 1) return [[players]];
  const results: PickerPlayer[][][] = [];
  // Assign each player a group index; keep player 0 in group 0 to avoid
  // enumerating the same unordered split multiple times.
  const assign = new Array<number>(players.length).fill(0);
  const recurse = (i: number): void => {
    if (i === players.length) {
      const groups: PickerPlayer[][] = Array.from({ length: count }, () => []);
      players.forEach((p, pi) => groups[assign[pi]!]!.push(p));
      if (groups.every((g) => g.length > 0)) results.push(groups);
      return;
    }
    const max = i === 0 ? 0 : count - 1;
    for (let g = 0; g <= max; g++) {
      assign[i] = g;
      recurse(i + 1);
    }
  };
  recurse(0);
  return results;
}

/** All ways to choose `count` distinct games (unordered handled by caller pairing with groups). */
function gameCombos(games: PickerGame[], count: number): PickerGame[][] {
  if (count === 1) return games.map((g) => [g]);
  const results: PickerGame[][] = [];
  const pick = (start: number, chosen: PickerGame[]): void => {
    if (chosen.length === count) {
      results.push([...chosen]);
      return;
    }
    for (let i = start; i < games.length; i++) {
      pick(i + 1, [...chosen, games[i]!]);
    }
  };
  pick(0, []);
  return results;
}

function describeTable(game: PickerGame, players: PickerPlayer[]): string {
  const names = players
    .map((p) => `${p.name} (${VOTE_LABELS[level(game, p.id)]})`)
    .join(", ");
  return `${game.title}: ${names}`;
}

export const interestMax: PickerStrategy = {
  id: "interest-max",
  name: "Maximize interest",
  description:
    "Brute-forces every valid table split and ranks them by everyone's interest votes. Never seats someone at a game they passed on if it can help it.",

  suggest(input: PickerInput): PickerSuggestion[] {
    const { players, games, tableCount } = input;
    if (players.length === 0 || games.length < tableCount) return [];

    const suggestions: PickerSuggestion[] = [];

    for (const combo of gameCombos(games, tableCount)) {
      for (const groups of partitions(players, tableCount)) {
        // Match each group with each game ordering of this combo (permute the
        // combo across groups; for tableCount<=2 this is at most 2 orderings).
        const orderings: PickerGame[][] =
          tableCount === 1 ? [combo] : [combo, [...combo].reverse()];

        for (const ordered of orderings) {
          let valid = true;
          let score = 0;
          const tables: SuggestionTable[] = [];

          for (let t = 0; t < tableCount; t++) {
            const game = ordered[t]!;
            const group = groups[t]!;
            if (group.length < game.minPlayers || group.length > game.maxPlayers) {
              valid = false;
              break;
            }
            score += group.reduce((s, p) => s + playerScore(game, p.id), 0);
            tables.push({ gameId: game.id, playerIds: group.map((p) => p.id) });
          }
          if (!valid) continue;

          const sizes = groups.map((g) => g.length);
          score -= BALANCE_WEIGHT * (Math.max(...sizes) - Math.min(...sizes));

          const passCount = tables.reduce((n, tbl) => {
            const game = games.find((g) => g.id === tbl.gameId)!;
            return n + tbl.playerIds.filter((id) => level(game, id) === 0).length;
          }, 0);

          const rationale =
            tables
              .map((tbl) =>
                describeTable(
                  games.find((g) => g.id === tbl.gameId)!,
                  players.filter((p) => tbl.playerIds.includes(p.id)),
                ),
              )
              .join(" · ") +
            (passCount > 0
              ? ` — ⚠ ${passCount} player(s) assigned to a game they passed on`
              : "");

          suggestions.push({ tables, score, rationale });
        }
      }
    }

    // Rank, then dedupe identical table sets (same games with same players).
    suggestions.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const top: PickerSuggestion[] = [];
    for (const s of suggestions) {
      const key = s.tables
        .map((t) => `${t.gameId}:${[...t.playerIds].sort((a, b) => a - b).join(",")}`)
        .sort()
        .join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      top.push(s);
      if (top.length >= 5) break;
    }
    return top;
  },
};
