/**
 * Voting methods: how a session gets from its nominations to the game(s) it
 * plays.
 *
 * Every session goes nominating → voting → decided (`slots.pickState`), and
 * nominating and deciding are the same whatever the method. What a method owns
 * is the voting in between: what a ballot looks like each round, and what
 * advancing the round does. A session records its method in
 * `slots.votingMethod`, so it keeps the rules it was voted under.
 *
 * Methods are pure — they read a `RoundContext` and return a decision — so the
 * advance route, and the event bundle that previews the next cut for the
 * phones and the TV, can never disagree about what's going to happen.
 */

/** One game still in the running, as this round's vote sees it. */
export interface Contender {
  gameId: number;
  /** Approvals this round. */
  votes: number;
  /** Fist bumps minus sad faces for this game in this session (not per round). */
  interest: number;
}

export interface RoundContext {
  /** How many games the session ends up playing: 1, or 2 for two tables. */
  gameCount: number;
  round: number;
  contenders: Contender[];
}

/**
 * What a person fills in this round. A discriminated union so the clients can
 * switch on `kind` and render the right ballot; approval is the only kind so
 * far. A method with a different kind of ballot (say, ranking) needs somewhere
 * to store it too — the `approvals` table only holds approvals.
 */
export type Ballot = { kind: "approval"; maxApprovals: number };

/** What advancing the round would do right now. */
export type RoundPlan =
  | {
      outcome: "cut";
      gameIds: number[];
      /** "interest": games tied on votes at the cut line and fist bumps split them. */
      decidedBy: "votes" | "interest";
    }
  /** No fair cut can be made; `gameIds` are the games tied at the line. */
  | { outcome: "tie"; gameIds: number[] }
  /** Nobody has voted this round yet, so there's nothing to cut on (`gameIds` is empty). */
  | { outcome: "waiting"; gameIds: number[] };

export interface VotingMethod {
  id: string;
  name: string;
  /** A sentence for anyone choosing between methods. */
  description: string;
  ballot(ctx: RoundContext): Ballot;
  /** This round's rules in one short line, for the phones and the TV. */
  summary(ctx: RoundContext): string;
  plan(ctx: RoundContext): RoundPlan;
}
