/**
 * Pluggable game-picker strategies.
 *
 * A strategy takes the slot's context (who's playing, which games are
 * candidates, how many parallel tables) and returns ranked suggestions for
 * "which game at which table with which people". Strategies are pure —
 * no DB access — so new selection systems are drop-in files (see registry.ts).
 */

export interface PickerPlayer {
  id: number;
  name: string;
}

export interface PickerGame {
  id: number;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  length: "long" | "short";
  /** userId -> interest level (0 Pass, 1 Fine, 2 Keen, 3 Must play). */
  votes: Record<number, number>;
}

export interface PickerHistoryPlay {
  gameId: number;
  playerIds: number[];
}

export interface PickerInput {
  players: PickerPlayer[];
  games: PickerGame[];
  /** Number of parallel tables to fill (1 for a whole-group game, 2 for a split). */
  tableCount: number;
  /** Plays already scheduled in this event — for fairness-style strategies. */
  history: PickerHistoryPlay[];
}

export interface SuggestionTable {
  gameId: number;
  playerIds: number[];
}

export interface PickerSuggestion {
  tables: SuggestionTable[];
  score: number;
  rationale: string;
}

export interface PickerStrategy {
  id: string;
  name: string;
  description: string;
  suggest(input: PickerInput): PickerSuggestion[];
}

export const VOTE_LABELS: Record<number, string> = {
  0: "Pass",
  1: "Fine",
  2: "Keen",
  3: "Must play",
};
