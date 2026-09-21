import type { Contender, RoundContext, RoundPlan, VotingMethod } from "./types.js";

const MAX_APPROVALS = 3;

/**
 * Never more approvals than games that still have to go, so the allowance
 * falls 3 → 2 → 1 as the field narrows. With three each and three games left
 * everyone approves everything and the vote says nothing.
 */
function maxApprovals({ contenders, gameCount }: RoundContext): number {
  return Math.min(MAX_APPROVALS, Math.max(1, contenders.length - gameCount));
}

/**
 * Everything on 1 vote or fewer goes, but never below `gameCount`. When
 * nothing is that low, the single lowest game goes instead: every round makes
 * progress, so a group that all quite like the same four games isn't stuck
 * being told to approve fewer. Where the line falls between games on the same
 * votes, the one fewer people want to play (net fist bumps) goes, and only a
 * tie on both asks for another vote.
 */
function plan({ contenders, gameCount }: RoundContext): RoundPlan {
  // Before anyone votes every game ties on nothing, and fist bumps alone
  // would decide the cut — they only ever break a tie between votes.
  if (contenders.every((c) => c.votes === 0)) return { outcome: "waiting", gameIds: [] };

  const maxDrop = contenders.length - gameCount;
  // Lowest first: fewest votes, then least wanted.
  const ranked = [...contenders].sort(
    (a, b) => a.votes - b.votes || a.interest - b.interest || a.gameId - b.gameId,
  );
  const low = ranked.filter((c) => c.votes <= 1);
  const pool = low.length > 0 ? low : ranked;
  const count = Math.min(low.length > 0 ? low.length : 1, maxDrop);

  const ids = (cs: Contender[]) => cs.map((c) => c.gameId);
  const last = pool[count - 1];
  const next = pool[count];
  // Either everything in the pool goes, or votes alone draw the line.
  if (!last || !next || last.votes !== next.votes) {
    return { outcome: "cut", gameIds: ids(pool.slice(0, count)), decidedBy: "votes" };
  }
  if (last.interest !== next.interest) {
    return { outcome: "cut", gameIds: ids(pool.slice(0, count)), decidedBy: "interest" };
  }
  return {
    outcome: "tie",
    gameIds: ids(ranked.filter((c) => c.votes === last.votes && c.interest === last.interest)),
  };
}

export const approvalElimination: VotingMethod = {
  id: "approval-elimination",
  name: "Approval elimination",
  description:
    "Rounds of approving the games you'd play. The least-approved go each round until the session is down to its games; fist bumps settle ties.",
  ballot: (ctx) => ({ kind: "approval", maxApprovals: maxApprovals(ctx) }),
  summary: (ctx) => {
    const n = maxApprovals(ctx);
    return `Approve up to ${n} · down to ${ctx.gameCount} · lowest votes go, fist bumps break ties`;
  },
  plan,
};
