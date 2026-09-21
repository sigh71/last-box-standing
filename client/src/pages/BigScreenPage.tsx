import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  HandFist,
  Maximize,
  Minimize,
  Repeat,
  SkipForward,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import CandidateCard, { type CardMood } from "@/components/bigscreen/CandidateCard";
import Confetti from "@/components/bigscreen/Confetti";
import Reel from "@/components/bigscreen/Reel";
import { useLiveEvent } from "@/hooks/useLiveEvent";
import {
  PHASE_MS,
  useEliminationDirector,
  type PickSnapshot,
} from "@/hooks/useEliminationDirector";
import {
  advanceRound,
  ApiError,
  getEvent,
  startPicking,
  type Attendee,
  type Game,
} from "@/lib/api";
import { fmtDay } from "@/lib/dates";
import { firstName } from "@/lib/names";
import {
  cueCut,
  cueDrumroll,
  cueFanfare,
  cueVerdict,
  cueVote,
  setMuted,
  unlockAudio,
} from "@/lib/fanfare";
import { cn } from "@/lib/utils";
import "@/styles/bigscreen.css";

/** Idle time before the control bar gets out of the way of the show. */
const CONTROLS_IDLE_MS = 4000;

/** Minimal shape of the Screen Wake Lock API, which older DOM types lack. */
interface WakeLockish {
  wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
}

/**
 * Big screen mode: one session, on the TV, for the room to watch while
 * everyone votes from their phones.
 *
 * It reads the same event bundle and the same live stream as the event page —
 * this is a presentation of the picking flow, not a second implementation of
 * it. What it adds is timing: `useEliminationDirector` holds the picture back
 * so a round that the server resolves in one write plays out as a verdict, a
 * cut, a drumroll and a reveal.
 *
 * It can also drive the session (start, advance), so whoever has the remote
 * doesn't have to pick their phone back up between rounds.
 */
export default function BigScreenPage() {
  const params = useParams();
  const eventId = Number(params.id);
  const slotId = Number(params.slotId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: bundle, isLoading, error } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => getEvent(eventId),
    enabled: Number.isInteger(eventId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 3,
  });
  useLiveEvent(eventId);

  const slot = bundle?.slots.find((s) => s.id === slotId);

  // The director compares successive snapshots, so this has to be stable
  // across renders that didn't change the data.
  const live = useMemo<PickSnapshot | null>(
    () =>
      bundle && slot
        ? {
            pickState: slot.pickState,
            pickRound: slot.pickRound,
            gameCount: slot.gameCount,
            noms: bundle.nominations.filter((n) => n.slotId === slotId),
            approvals: bundle.approvals.filter((a) => a.slotId === slotId),
          }
        : null,
    [bundle, slot, slotId],
  );
  const production = useEliminationDirector(live);

  // The presentation waits behind a curtain until someone starts it, so
  // whoever is running the room can get the TV, the lights and any recording
  // set up before the first card appears. It also guarantees the click the
  // browser wants before it will let any audio play.
  const [started, setStarted] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ---- Sound ----

  useEffect(() => setMuted(muted), [muted]);

  const phase = production?.phase;
  const doomedCount = production?.doomed.length ?? 0;
  const lastPhase = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!phase || phase === lastPhase.current) return;
    lastPhase.current = phase;
    if (phase === "verdict") cueVerdict();
    // Staggered so a round that drops three games sounds like three cuts.
    if (phase === "cull") for (let i = 0; i < doomedCount; i++) cueCut(i);
    if (phase === "drumroll") cueDrumroll(PHASE_MS.DRUMROLL_MS / 1000);
    if (phase === "reveal") cueFanfare();
  }, [phase, doomedCount]);

  // A vote landing on someone else's phone should be audible in the room.
  const approvalCount = production?.snapshot.approvals.length ?? 0;
  const lastApprovals = useRef(approvalCount);
  useEffect(() => {
    if (approvalCount > lastApprovals.current && phase === "live") cueVote();
    lastApprovals.current = approvalCount;
  }, [approvalCount, phase]);

  // ---- Screen furniture ----

  // A TV showing a vote in progress must not fall asleep mid-round.
  useEffect(() => {
    let sentinel: { release(): Promise<void> } | null = null;
    let released = false;
    const request = () => {
      void (navigator as Navigator & WakeLockish).wakeLock
        ?.request("screen")
        .then((s) => {
          if (released) void s.release().catch(() => {});
          else sentinel = s;
        })
        .catch(() => {});
    };
    request();
    // The lock is dropped whenever the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  // Controls fade out of the way, and any input brings them back. The same
  // gesture is what lets the browser start audio, so unlock it here too.
  useEffect(() => {
    let timer = 0;
    const wake = () => {
      unlockAudio();
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), CONTROLS_IDLE_MS);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  // ---- Driving the session from the couch ----

  const onDone = () => {
    setActionError(null);
    return queryClient.invalidateQueries({ queryKey: ["event", eventId] });
  };
  const onFail = (e: unknown) => setActionError((e as Error).message);

  const start = useMutation({
    mutationFn: () => startPicking(slotId),
    onSuccess: onDone,
    onError: onFail,
  });
  const advance = useMutation({
    mutationFn: () => advanceRound(slotId),
    onSuccess: onDone,
    onError: onFail,
  });

  const snapshot = production?.snapshot;
  const busy = production?.busy ?? false;
  const remaining = useMemo(
    () => snapshot?.noms.filter((n) => n.eliminatedRound === null) ?? [],
    [snapshot],
  );
  const voteCount = useCallback(
    (gameId: number) => snapshot?.approvals.filter((a) => a.gameId === gameId).length ?? 0,
    [snapshot],
  );
  const droppable = remaining.filter((n) => voteCount(n.gameId) <= 1).length;
  const willDrop = snapshot ? Math.min(droppable, remaining.length - snapshot.gameCount) : 0;

  const canAdvance =
    !busy && !advance.isPending && snapshot?.pickState === "eliminating" && willDrop > 0;
  const canStart =
    !busy && !start.isPending && snapshot?.pickState === "nominating" && remaining.length > 0;

  const goOn = useCallback(() => {
    if (canAdvance) advance.mutate();
    else if (canStart) start.mutate();
  }, [canAdvance, canStart, advance, start]);

  const leave = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    void navigate(`/events/${eventId}`);
  }, [navigate, eventId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!started) {
          unlockAudio();
          setStarted(true);
        } else {
          goOn();
        }
      } else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === "m" || e.key === "M") setMutedState((v) => !v);
      else if (e.key === "Escape" && !document.fullscreenElement) leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goOn, toggleFullscreen, leave, started]);

  // ---- Render ----

  const gone = error instanceof ApiError && error.status === 404;
  if (isLoading) {
    return <Shell>Loading…</Shell>;
  }
  if (gone || !bundle || !slot || !production || !snapshot) {
    return (
      <Shell>
        <p>{gone ? "This weekend has been deleted." : "That session isn't here any more."}</p>
        <Link to="/" className="mt-4 text-lg underline underline-offset-4">
          Back to weekends
        </Link>
      </Shell>
    );
  }

  const gameById = (id: number): Game | undefined => bundle.games.find((g) => g.id === id);
  const attendeeById = (id: number): Attendee | undefined =>
    bundle.attendees.find((a) => a.id === id);
  const expansionNames = (ids: number[]) =>
    ids.map((id) => gameById(id)?.title).filter((t): t is string => Boolean(t));
  /**
   * Who fist-bumped a game. Read straight off the live bundle rather than
   * through the director: this only ever shows on the winners' board, where
   * the picture has already settled, and a bump landing on somebody's phone
   * while the room works out who sits where should appear as they make it.
   */
  const bumpers = (gameId: number): Attendee[] =>
    bundle.interest
      .filter((i) => i.slotId === slotId && i.gameId === gameId && i.stance === "up")
      .map((i) => attendeeById(i.userId))
      .filter((a): a is Attendee => Boolean(a));

  const doomed = new Set(production.doomed);
  const showdown = production.phase === "verdict" || production.phase === "cull";
  const voters = new Set(snapshot.approvals.map((a) => a.userId));
  const topVotes = Math.max(0, ...remaining.map((n) => voteCount(n.gameId)));
  const eliminated = snapshot.noms.filter((n) => n.eliminatedRound !== null);
  const winners = production.winners.length > 0 ? production.winners : remaining.map((n) => n.gameId);

  const mood = (gameId: number): CardMood => {
    if (showdown) {
      if (doomed.has(gameId)) return production.phase === "cull" ? "cut" : "doomed";
      return "spared";
    }
    if (snapshot.pickState !== "eliminating") return "plain";
    const v = voteCount(gameId);
    if (v <= 1) return "risk";
    if (v === topVotes && topVotes > 1) return "lead";
    return "plain";
  };

  /**
   * Cards should fill a 16:9 screen with as few gaps as possible: a ragged
   * last row is the thing that makes a wall display look unfinished. Score
   * every plausible column count by the holes it leaves, breaking ties towards
   * a roughly square grid.
   */
  const columns = (() => {
    const n = remaining.length;
    if (n <= 3) return Math.max(1, n);
    const ideal = Math.round(Math.sqrt(n * 1.6));
    let best = ideal;
    let bestScore = Infinity;
    for (let c = Math.min(6, n); c >= 2; c--) {
      const score = ((c - (n % c)) % c) * 3 + Math.abs(c - ideal);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  })();

  const headline =
    snapshot.pickState === "nominating"
      ? "Nominations open"
      : snapshot.pickState === "eliminating"
        ? `Round ${snapshot.pickRound}`
        : snapshot.gameCount === 2
          ? "Tonight's two tables"
          : "Tonight's game";

  const subline =
    snapshot.pickState === "nominating"
      ? "Add games from your phone"
      : snapshot.pickState === "eliminating"
        ? `Approve up to 3 · down to ${snapshot.gameCount} · anything on 1 vote or fewer can go`
        : "Locked in";

  /** What the curtain says is waiting behind it. */
  const standby =
    snapshot.pickState === "nominating"
      ? `${remaining.length} game${remaining.length === 1 ? "" : "s"} nominated`
      : snapshot.pickState === "eliminating"
        ? `Round ${snapshot.pickRound} · ${remaining.length} in the running · ${voters.size} of ${bundle.attendees.length} voted`
        : snapshot.gameCount === 2
          ? "Decided — two tables"
          : "Decided";

  const revealing = production.phase === "reveal";
  const decided = snapshot.pickState === "decided" && production.phase === "live";

  return (
    <div className="bs-root flex flex-col">
      {/* ---- Header ---- */}
      <header className="relative z-[5] flex items-start justify-between gap-[2vmin] px-[3vmin] pt-[2.5vmin]">
        <div className="min-w-0">
          <p className="truncate text-[clamp(0.8rem,1.8vmin,1.6rem)] tracking-[0.25em] text-[var(--bs-dim)] uppercase">
            {bundle.event.name} · {fmtDay(slot.day)} · {slot.label}
          </p>
          <h1 className="text-[clamp(1.6rem,5vmin,5rem)] leading-none font-black tracking-tight">
            {headline}
          </h1>
          <p className="mt-[0.8vmin] text-[clamp(0.75rem,1.7vmin,1.5rem)] text-[var(--bs-dim)]">
            {subline}
          </p>
        </div>

        {snapshot.pickState === "eliminating" && (
          <div className="flex shrink-0 flex-col items-end gap-[1vmin]">
            <p className="text-[clamp(0.75rem,1.7vmin,1.5rem)] text-[var(--bs-dim)]">
              {voters.size} of {bundle.attendees.length} voted
            </p>
            <div className="flex -space-x-[0.8vmin]">
              {bundle.attendees.map((a) => (
                <UserAvatar
                  key={a.id}
                  user={a}
                  className={cn(
                    "size-[max(1.5rem,4vmin)] ring-2 transition-opacity duration-500",
                    voters.has(a.id) ? "ring-[var(--bs-live)]" : "opacity-30 ring-white/20",
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ---- The arena ---- */}
      <main className="relative z-[1] flex min-h-0 flex-1 flex-col justify-center px-[3vmin] py-[2vmin]">
        {decided || revealing ? (
          <WinnersBoard
            winners={winners}
            gameById={gameById}
            expansionNames={expansionNames}
            // Only two tables need to know who's sitting where.
            bumpers={snapshot.gameCount === 2 ? bumpers : undefined}
            snapshot={snapshot}
            celebrating={revealing}
          />
        ) : remaining.length === 0 ? (
          <p className="text-center text-[clamp(1rem,3vmin,3rem)] text-[var(--bs-dim)]">
            Nothing nominated yet.
          </p>
        ) : (
          <div
            className="bs-arena grid min-h-0 flex-1 gap-[2vmin]"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridAutoRows: "minmax(0, 1fr)",
            }}
          >
            {remaining.map((n) => (
              <CandidateCard
                key={n.gameId}
                game={gameById(n.gameId)}
                nomination={n}
                expansions={expansionNames(n.expansionGameIds)}
                approvers={snapshot.approvals
                  .filter((a) => a.gameId === n.gameId)
                  .map((a) => attendeeById(a.userId))
                  .filter((a): a is Attendee => Boolean(a))}
                voterCount={bundle.attendees.length}
                mood={mood(n.gameId)}
                showVotes={snapshot.pickState === "eliminating"}
                nominator={
                  snapshot.pickState === "nominating" ? attendeeById(n.nominatedBy) : undefined
                }
              />
            ))}
          </div>
        )}

        {/* What's already out, kept on screen so the shortlist has a history. */}
        {eliminated.length > 0 && !revealing && (
          <div className="mt-[2vmin] flex flex-wrap justify-center gap-x-[2.5vmin] gap-y-[0.8vmin]">
            {eliminated.map((n) => (
              <span
                key={n.gameId}
                className="text-[clamp(0.7rem,1.5vmin,1.4rem)] text-[var(--bs-dim)]/60 line-through"
              >
                {gameById(n.gameId)?.title}
              </span>
            ))}
          </div>
        )}
      </main>

      {/* ---- Moments ---- */}
      {production.phase === "verdict" && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <p className="bs-banner text-center">The votes are in</p>
        </div>
      )}

      {production.phase === "drumroll" && (
        <div className="bs-veil gap-[3vmin] px-[6vmin]">
          <p className="text-[clamp(1rem,3vmin,3rem)] tracking-[0.3em] text-[var(--bs-dim)] uppercase">
            {winners.length > 1 ? "And the games are…" : "And the game is…"}
          </p>
          <div className="flex w-full max-w-[92vw] flex-wrap justify-center gap-[3vmin]">
            {winners.map((id, i) => (
              <Reel
                key={id}
                className="min-w-[38vmin] max-w-[52vw] flex-1"
                labels={snapshot.noms
                  .map((n) => gameById(n.gameId)?.title)
                  .filter((t): t is string => Boolean(t))}
                final={gameById(id)?.title ?? "…"}
                // Reels lock left to right, the last one just before the reveal.
                stopAt={1100 + i * 700}
                offset={i * 3 + 1}
              />
            ))}
          </div>
        </div>
      )}

      {revealing && <Confetti />}

      {/* ---- Controls ---- */}
      {!started && (
        <div className="bs-curtain px-[6vmin]">
          <p className="text-[clamp(0.8rem,1.8vmin,1.6rem)] tracking-[0.3em] text-[var(--bs-dim)] uppercase">
            {bundle.event.name} · {fmtDay(slot.day)}
          </p>
          <h2 className="text-[clamp(2rem,9vmin,10rem)] leading-none font-black tracking-tight">
            {slot.label}
          </h2>
          <p className="text-[clamp(0.85rem,2.2vmin,2rem)] text-[var(--bs-dim)]">
            {standby}
          </p>
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              setStarted(true);
            }}
            className={cn(
              "bs-start mt-[2vmin] rounded-full bg-[var(--bs-gold)] px-[5vmin] py-[2vmin]",
              "text-[clamp(1rem,3vmin,3rem)] font-black tracking-wide text-[oklch(0.2_0.05_90)]",
              "transition-transform hover:scale-105",
            )}
          >
            Start
          </button>
          <p className="text-[clamp(0.7rem,1.5vmin,1.3rem)] text-[var(--bs-dim)]/70">
            F for fullscreen · M for sound · Esc to leave
          </p>
        </div>
      )}

      <footer
        className="bs-controls relative z-30 flex flex-col items-center gap-[1vmin] px-[3vmin] pb-[2.5vmin]"
        data-hidden={(idle && !actionError) || !started}
      >
        {actionError && (
          <p className="rounded-full bg-[oklch(0.35_0.16_25)] px-5 py-2 text-[clamp(0.75rem,1.7vmin,1.4rem)]">
            {actionError}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-[1.2vmin]">
          <Pill onClick={leave} title="Back to the weekend (Esc)">
            <X className="size-[2.2vmin] min-h-4 min-w-4" />
          </Pill>
          <Pill onClick={toggleFullscreen} title="Fullscreen (F)">
            {fullscreen ? (
              <Minimize className="size-[2.2vmin] min-h-4 min-w-4" />
            ) : (
              <Maximize className="size-[2.2vmin] min-h-4 min-w-4" />
            )}
          </Pill>
          <Pill onClick={() => setMutedState((v) => !v)} title="Sound (M)">
            {muted ? (
              <VolumeX className="size-[2.2vmin] min-h-4 min-w-4" />
            ) : (
              <Volume2 className="size-[2.2vmin] min-h-4 min-w-4" />
            )}
          </Pill>

          {busy ? (
            <Pill onClick={production.skip} title="Skip the animation" wide>
              <SkipForward className="size-[2.2vmin] min-h-4 min-w-4" />
              Skip
            </Pill>
          ) : snapshot.pickState === "decided" ? (
            <Pill onClick={production.replay} title="Play the reveal again" wide>
              <Repeat className="size-[2.2vmin] min-h-4 min-w-4" />
              Replay the reveal
            </Pill>
          ) : snapshot.pickState === "nominating" ? (
            <Pill onClick={goOn} disabled={!canStart} wide primary>
              <ChevronRight className="size-[2.2vmin] min-h-4 min-w-4" />
              {remaining.length <= snapshot.gameCount ? "Lock it in" : "Start the elimination"}
            </Pill>
          ) : (
            <Pill onClick={goOn} disabled={!canAdvance} wide primary>
              <ChevronRight className="size-[2.2vmin] min-h-4 min-w-4" />
              {willDrop > 0
                ? `Cut ${willDrop} game${willDrop === 1 ? "" : "s"}`
                : "Every game has support — vote again"}
            </Pill>
          )}
        </div>
      </footer>
    </div>
  );
}

/**
 * The winner (or both winners), centre stage.
 *
 * With two tables the board has a second job once the titles are up: the room
 * has to split, and the fist bumps already say who'd sit down to what. So each
 * winner carries the people who bumped it — which is the one question left to
 * answer, and answering it off the TV beats six people re-reading their phones.
 */
function WinnersBoard({
  winners,
  gameById,
  expansionNames,
  bumpers,
  snapshot,
  celebrating,
}: {
  winners: number[];
  gameById: (id: number) => Game | undefined;
  expansionNames: (ids: number[]) => string[];
  /** Who'd play each game. Undefined for a one-game session, where nobody splits. */
  bumpers?: (gameId: number) => Attendee[];
  snapshot: PickSnapshot;
  /** True during the reveal itself; false once it settles into the night's board. */
  celebrating: boolean;
}) {
  const bumpedBy = winners.map((id) => bumpers?.(id) ?? []);
  // All or nothing: two empty headings are clutter, but one empty column
  // beside a full one is information — that table has nobody in it yet.
  const showBumps = bumpedBy.some((people) => people.length > 0);

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center gap-[3vmin]">
      {celebrating && <div className="bs-rays" aria-hidden />}
      {winners.map((id, i) => {
        const game = gameById(id);
        const nom = snapshot.noms.find((n) => n.gameId === id);
        const art = game?.imageUrl ?? game?.thumbnailUrl;
        const expansions = nom ? expansionNames(nom.expansionGameIds) : [];
        return (
          <div
            key={id}
            className={cn(
              // Above the rays, which share this stacking context.
              "relative z-[1] flex min-w-0 flex-1 flex-col items-center gap-[2vmin] text-center",
              celebrating && "bs-hero",
            )}
          >
            {art && (
              <img
                src={art}
                alt=""
                className="max-h-[42vh] min-h-0 rounded-[1.5vmin] object-contain shadow-[0_2vmin_6vmin_oklch(0_0_0/0.6)] ring-2 ring-[var(--bs-gold)]/40"
              />
            )}
            <div className="min-w-0">
              <p className="flex items-center justify-center gap-[1vmin] text-[clamp(0.7rem,1.6vmin,1.4rem)] tracking-[0.3em] text-[var(--bs-gold)] uppercase">
                <Trophy className="size-[2.2vmin] min-h-4 min-w-4" />
                Playing
              </p>
              <p
                className={cn(
                  "leading-[1.02] font-black tracking-tight",
                  celebrating
                    ? "bs-title-glow text-[clamp(1.8rem,7.5vmin,8.5rem)]"
                    : "text-[clamp(1.6rem,6vmin,7rem)]",
                )}
              >
                {game?.title ?? "Unknown game"}
              </p>
              {expansions.length > 0 && (
                <p className="mt-[0.8vmin] text-[clamp(0.9rem,2.4vmin,2.4rem)] text-[var(--bs-gold)]/85">
                  + {expansions.join(" + ")}
                </p>
              )}
              {nom && (
                <p className="mt-[0.8vmin] text-[clamp(0.75rem,1.7vmin,1.5rem)] text-[var(--bs-dim)]">
                  {nom.minPlayers}–{nom.maxPlayers} players
                </p>
              )}
              {showBumps && <Bumpers people={bumpedBy[i] ?? []} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Everyone who fist-bumped one of the two winners, under its title.
 *
 * First names only: this is the list the room reads to work out where to sit,
 * and at this size six surnames cost a line each for nothing.
 */
function Bumpers({ people }: { people: Attendee[] }) {
  return (
    <div className="mt-[1.6vmin] flex flex-col items-center gap-[1vmin]">
      <p className="flex items-center gap-[0.8vmin] text-[clamp(0.65rem,1.4vmin,1.2rem)] tracking-[0.28em] text-[var(--bs-dim)] uppercase">
        <HandFist className="size-[1.9vmin] min-h-3.5 min-w-3.5" />
        {people.length > 0 ? "Fist my bump" : "Nobody yet"}
      </p>
      {people.length > 0 && (
        <div className="flex flex-wrap justify-center gap-[0.8vmin]">
          {people.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-[0.8vmin] rounded-full bg-white/10 py-[0.5vmin] pr-[1.6vmin] pl-[0.5vmin]"
            >
              <UserAvatar user={a} className="size-[max(1.25rem,3.4vmin)]" />
              <span className="text-[clamp(0.8rem,2.2vmin,2rem)] leading-none font-semibold">
                {firstName(a)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({
  children,
  onClick,
  title,
  disabled,
  wide,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  wide?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "flex items-center gap-[1vmin] rounded-full border border-white/15 backdrop-blur-sm transition-colors",
        "text-[clamp(0.75rem,1.7vmin,1.4rem)] font-medium disabled:opacity-40",
        wide ? "px-[2.4vmin] py-[1.2vmin]" : "p-[1.2vmin]",
        primary
          ? "bg-white/90 text-[oklch(0.2_0.03_275)] hover:bg-white disabled:bg-white/25 disabled:text-white"
          : "bg-white/10 hover:bg-white/20",
      )}
    >
      {children}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bs-root grid place-items-center text-center text-[clamp(1rem,2.5vmin,2rem)]">
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}
