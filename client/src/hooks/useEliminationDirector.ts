import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Approval, Nomination, PickState, VotingView } from "@/lib/api";

/**
 * Choreographs big screen mode.
 *
 * The rest of the app renders the event bundle as it arrives, which is exactly
 * wrong for a room watching a TV: the server decides a whole round in one
 * write, so the bundle jumps straight from "six games in the running" to "one
 * game, decided" with nothing in between. Every drop and every win would
 * happen in a single frame, off screen, while people were still looking at
 * their phones.
 *
 * So this hook keeps a *shown* snapshot that deliberately lags the live one.
 * When the live snapshot moves on it works out what changed, holds the old
 * picture up while it plays that change out — the verdict, the cut, the
 * drumroll, the reveal — and only then adopts the new one. Vote counts within
 * a round are adopted immediately; there's no drama to spoil and stale numbers
 * on a wall are worse than no numbers.
 *
 * Only the presentation lags. Nothing here writes, and phones voting against
 * the same session are unaffected by whatever the TV is currently showing.
 */
export type Phase = "live" | "verdict" | "cull" | "drumroll" | "reveal";

export interface PickSnapshot {
  pickState: PickState;
  pickRound: number;
  /** How many games this session ends up playing — how many winners there are. */
  gameCount: number;
  noms: Nomination[];
  /** Current round only, which is all the server sends. */
  approvals: Approval[];
  /**
   * The round as the session's voting method sees it, including what the next
   * cut would be. Part of the snapshot so it lags with everything else: during
   * a verdict it still describes the cut that's playing out.
   */
  voting: VotingView | null;
}

export interface Production {
  phase: Phase;
  /** Draw this, not the live bundle. */
  snapshot: PickSnapshot;
  /** Games being cut right now — empty outside `verdict` and `cull`. */
  doomed: number[];
  /** Survivors, during `drumroll` and `reveal`. */
  winners: number[];
  /** True while a sequence is playing and the shown snapshot is behind. */
  busy: boolean;
  /** Cut the current sequence short and jump to the live state. */
  skip: () => void;
  /** Run the drumroll and reveal again for an already-decided session. */
  replay: () => void;
}

const VERDICT_MS = 1900;
const CULL_MS = 1900;
const DRUMROLL_MS = 2600;
/** How long the winner holds the whole screen before settling into the calm
 *  "now playing" board that can be left up for the rest of the evening. */
const REVEAL_MS = 8000;

export const PHASE_MS = { VERDICT_MS, CULL_MS, DRUMROLL_MS, REVEAL_MS };

const eliminatedIds = (s: PickSnapshot) =>
  s.noms.filter((n) => n.eliminatedRound !== null).map((n) => n.gameId);

const survivingIds = (s: PickSnapshot) =>
  s.noms.filter((n) => n.eliminatedRound === null).map((n) => n.gameId);

export function useEliminationDirector(live: PickSnapshot | null): Production | null {
  const [shown, setShown] = useState<PickSnapshot | null>(null);
  const [phase, setPhase] = useState<Phase>("live");
  const [doomed, setDoomed] = useState<number[]>([]);
  const [winners, setWinners] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  // Bumped when a sequence finishes, to re-check whether the live state moved
  // on again while it was playing (someone advancing twice in quick succession).
  const [seq, setSeq] = useState(0);

  const shownRef = useRef<PickSnapshot | null>(null);
  const liveRef = useRef<PickSnapshot | null>(null);
  const busyRef = useRef(false);
  const timers = useRef<number[]>([]);

  liveRef.current = live;

  /**
   * The effect has to re-run whenever the *contents* of the live snapshot
   * change, and callers rebuild it by filtering the bundle — a fresh object
   * every render. Comparing a serialised form instead of the identity keeps a
   * caller that forgets to memoise from looping.
   */
  const fingerprint = useMemo(() => (live ? JSON.stringify(live) : ""), [live]);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const show = useCallback((s: PickSnapshot) => {
    shownRef.current = s;
    setShown(s);
  }, []);

  const finish = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
    setSeq((s) => s + 1);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    const next = liveRef.current;
    if (!next) return;

    // Arriving at a session that has already been decided shouldn't replay a
    // reveal nobody was here for — the first snapshot is adopted as-is.
    if (!shownRef.current) {
      show(next);
      return;
    }
    // A sequence owns the screen until it ends; `finish` re-runs this check.
    if (busyRef.current) return;

    const prev = shownRef.current;
    const before = new Set(eliminatedIds(prev));
    const cut = eliminatedIds(next).filter((id) => !before.has(id));
    const decided = next.pickState === "decided" && prev.pickState !== "decided";

    // Nominations coming and going, votes landing, a reopened session: real
    // changes, but not moments. Adopt them without ceremony.
    if (cut.length === 0 && !decided) {
      show(next);
      return;
    }

    busyRef.current = true;
    setBusy(true);
    clearTimers();
    const at = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    let t = 0;
    if (cut.length > 0) {
      // Hold the pre-advance picture: the doomed games are still on screen,
      // still showing the votes that did for them.
      setDoomed(cut);
      setPhase("verdict");
      t += VERDICT_MS;
      at(t, () => setPhase("cull"));
      t += CULL_MS;
      at(t, () => {
        show(next);
        setDoomed([]);
        if (!decided) setPhase("live");
      });
    } else {
      show(next);
    }

    if (decided) {
      setWinners(survivingIds(next));
      at(t, () => setPhase("drumroll"));
      t += DRUMROLL_MS;
      at(t, () => setPhase("reveal"));
      t += REVEAL_MS;
      at(t, () => setPhase("live"));
    }
    at(t, finish);
  }, [fingerprint, seq, clearTimers, finish, show]);

  const skip = useCallback(() => {
    clearTimers();
    const next = liveRef.current;
    if (next) show(next);
    setDoomed([]);
    setPhase("live");
    finish();
  }, [clearTimers, finish, show]);

  const replay = useCallback(() => {
    const current = shownRef.current;
    if (!current || current.pickState !== "decided") return;
    clearTimers();
    busyRef.current = true;
    setBusy(true);
    setWinners(survivingIds(current));
    setPhase("drumroll");
    const at = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };
    at(DRUMROLL_MS, () => setPhase("reveal"));
    at(DRUMROLL_MS + REVEAL_MS, () => {
      setPhase("live");
      finish();
    });
  }, [clearTimers, finish]);

  if (!shown) return null;
  return { phase, snapshot: shown, doomed, winners, busy, skip, replay };
}
