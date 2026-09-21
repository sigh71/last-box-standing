import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { approvals, nominationInterest, nominations, type Slot } from "../db/schema.js";
import { approvalElimination } from "./approval-elimination.js";
import type { Ballot, RoundContext, RoundPlan, VotingMethod } from "./types.js";

export type { Ballot, Contender, RoundContext, RoundPlan, VotingMethod } from "./types.js";

/** Register a new method here; sessions then pick it by id (`slots.votingMethod`). */
const methods: VotingMethod[] = [approvalElimination];

const byId = new Map(methods.map((m) => [m.id, m]));

export const DEFAULT_VOTING_METHOD = approvalElimination.id;

export function listVotingMethods(): Pick<VotingMethod, "id" | "name" | "description">[] {
  return methods.map(({ id, name, description }) => ({ id, name, description }));
}

/**
 * The method a session votes by. An id with no method behind it is a bug —
 * a method removed while sessions still used it — so it throws rather than
 * quietly voting under different rules.
 */
export function votingMethodFor(slot: Pick<Slot, "votingMethod">): VotingMethod {
  const method = byId.get(slot.votingMethod);
  if (!method) throw new Error(`Unknown voting method "${slot.votingMethod}"`);
  return method;
}

/** The games still in a session, with this round's votes and everyone's fist bumps. */
export function roundContext(slot: Slot): RoundContext {
  const remaining = db
    .select({ gameId: nominations.gameId })
    .from(nominations)
    .where(and(eq(nominations.slotId, slot.id), isNull(nominations.eliminatedRound)))
    .all();
  const votes = db
    .select({ gameId: approvals.gameId })
    .from(approvals)
    .where(and(eq(approvals.slotId, slot.id), eq(approvals.round, slot.pickRound)))
    .all();
  const stances = db
    .select({ gameId: nominationInterest.gameId, stance: nominationInterest.stance })
    .from(nominationInterest)
    .where(eq(nominationInterest.slotId, slot.id))
    .all();
  return {
    gameCount: slot.gameCount,
    round: slot.pickRound,
    contenders: remaining.map(({ gameId }) => ({
      gameId,
      votes: votes.filter((v) => v.gameId === gameId).length,
      interest: stances
        .filter((s) => s.gameId === gameId)
        .reduce((sum, s) => sum + (s.stance === "up" ? 1 : -1), 0),
    })),
  };
}

/** What the clients need to run a session's current round. */
export interface VotingView {
  method: string;
  ballot: Ballot;
  summary: string;
  plan: RoundPlan;
}

/** The current round for a session that's voting; null otherwise. */
export function votingView(slot: Slot): VotingView | null {
  if (slot.pickState !== "eliminating") return null;
  const method = votingMethodFor(slot);
  const ctx = roundContext(slot);
  return { method: method.id, ballot: method.ballot(ctx), summary: method.summary(ctx), plan: method.plan(ctx) };
}
