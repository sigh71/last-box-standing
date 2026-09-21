import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  MonitorPlay,
  Pencil,
  RotateCcw,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";
import PlayDialog from "@/components/PlayDialog";
import { ordinal } from "@/components/SortablePlayers";
import SessionDialog from "@/components/SessionDialog";
import NominateDialog from "@/components/NominateDialog";
import InterestButtons from "@/components/InterestButtons";
import {
  advanceRound,
  deletePlay,
  deleteSession,
  fetchMe,
  removeNomination,
  reopenSession,
  startPicking,
  toggleApproval,
  type EventBundle,
  type Game,
  type Play,
  type Slot,
} from "@/lib/api";
import { firstName, fullName } from "@/lib/names";
import { cn } from "@/lib/utils";

export default function SessionCard({
  eventId,
  bundle,
  slot,
}: {
  eventId: number;
  bundle: EventBundle;
  slot: Slot;
}) {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["event", eventId] });

  const [editOpen, setEditOpen] = useState(false);
  const [playDialog, setPlayDialog] = useState<{ play?: Play } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const gameById = (id: number): Game | undefined => bundle.games.find((g) => g.id === id);
  const expansionNames = (ids: number[]) =>
    ids.map((id) => gameById(id)?.title).filter(Boolean) as string[];
  const noms = bundle.nominations.filter((n) => n.slotId === slot.id);
  const remaining = noms.filter((n) => n.eliminatedRound === null);
  const eliminated = noms.filter((n) => n.eliminatedRound !== null);
  const slotInterest = bundle.interest.filter((i) => i.slotId === slot.id);
  const interestIn = (gameId: number) => slotInterest.filter((i) => i.gameId === gameId);
  /** Your nomination is yours to withdraw; admins can overrule. */
  const canRemoveNomination = (nominatedBy: number) =>
    me?.isAdmin === true || nominatedBy === me?.id;
  const slotApprovals = bundle.approvals.filter((a) => a.slotId === slot.id);
  const myApprovals = new Set(
    slotApprovals.filter((a) => a.userId === me?.id).map((a) => a.gameId),
  );
  const plays = bundle.plays.filter((p) => p.slotId === slot.id);

  /** Who came first, for a play whose result has been recorded. */
  const winnerName = (play: Play) => {
    const winner = bundle.attendees.find((x) => x.id === play.playerIds[0]);
    return winner ? firstName(winner) : null;
  };

  const voterCount = new Set(slotApprovals.map((a) => a.userId)).size;
  // The session's voting method owns the rules: how many you may approve this
  // round, and what advancing would cut. Nothing here second-guesses it.
  const voting = slot.voting;
  const maxApprovals = voting?.ballot.kind === "approval" ? voting.ballot.maxApprovals : 0;
  const plan = voting?.plan;
  const atRisk = new Set(plan?.gameIds ?? []);
  const canAdvance = plan?.outcome === "cut";

  const onError = (e: unknown) => setActionError((e as Error).message);
  const onOk = () => {
    setActionError(null);
    return invalidate();
  };

  const m = {
    removeNom: useMutation({
      mutationFn: (gameId: number) => removeNomination(slot.id, gameId),
      onSuccess: invalidate,
    }),
    start: useMutation({ mutationFn: () => startPicking(slot.id), onSuccess: invalidate }),
    approve: useMutation({
      mutationFn: (gameId: number) => toggleApproval(slot.id, gameId),
      onSuccess: onOk,
      onError,
    }),
    advance: useMutation({ mutationFn: () => advanceRound(slot.id), onSuccess: onOk, onError }),
    reopen: useMutation({ mutationFn: () => reopenSession(slot.id), onSuccess: invalidate }),
    removeSession: useMutation({
      mutationFn: () => deleteSession(eventId, slot.id),
      onSuccess: invalidate,
    }),
    removePlay: useMutation({ mutationFn: deletePlay, onSuccess: invalidate }),
  };

  const stateBadge =
    slot.pickState === "nominating"
      ? "Nominating"
      : slot.pickState === "eliminating"
        ? `Round ${slot.pickRound}`
        : "Decided";

  return (
    <div className="bg-background flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{slot.label}</span>
          <div className="flex gap-1">
            <Badge variant="secondary">{slot.gameCount === 2 ? "2 games" : "1 game"}</Badge>
            <Badge variant="outline">{stateBadge}</Badge>
          </div>
        </div>
        <div className="flex gap-0.5">
          {noms.length > 0 && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-9 sm:size-7"
              title="Big screen mode"
            >
              <Link to={`/events/${eventId}/sessions/${slot.id}/screen`}>
                <MonitorPlay className="size-3.5" />
              </Link>
            </Button>
          )}
          {slot.pickState !== "nominating" && (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 sm:size-7"
              title="Reopen nominations"
              onClick={() => m.reopen.mutate()}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 sm:size-7"
            title="Edit session"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 sm:size-7"
            title="Delete session"
            onClick={() => m.removeSession.mutate()}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ---- Nominating ---- */}
      {slot.pickState === "nominating" && (
        <div className="flex flex-col gap-2">
          {remaining.length === 0 && (
            <p className="text-muted-foreground/60 text-xs">No games nominated yet.</p>
          )}
          {remaining.map((n) => {
            const game = gameById(n.gameId);
            const nominator = bundle.attendees.find((a) => a.id === n.nominatedBy);
            return (
              <div key={n.gameId} className="group bg-muted/50 flex flex-col gap-1.5 rounded-md p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {game?.thumbnailUrl && (
                      <img src={game.thumbnailUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{game?.title}</p>
                      {expansionNames(n.expansionGameIds).map((name) => (
                        <p key={name} className="text-muted-foreground truncate text-xs">
                          + {name}
                        </p>
                      ))}
                      {nominator && (
                        <p className="text-muted-foreground text-xs">
                          by {firstName(nominator)}
                        </p>
                      )}
                    </div>
                  </div>
                  {canRemoveNomination(n.nominatedBy) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      // Always visible: hover-to-reveal hides it entirely on touch.
                      className="size-8"
                      title="Remove nomination"
                      onClick={() => m.removeNom.mutate(n.gameId)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
                <InterestButtons
                  eventId={eventId}
                  slotId={slot.id}
                  gameId={n.gameId}
                  interest={interestIn(n.gameId)}
                  attendees={bundle.attendees}
                  meId={me?.id}
                />
              </div>
            );
          })}
          <NominateDialog
            slotId={slot.id}
            eventId={eventId}
            availableGameIds={bundle.availableGameIds}
          />
          <Button
            size="sm"
            disabled={remaining.length === 0 || m.start.isPending}
            onClick={() => m.start.mutate()}
          >
            {remaining.length <= slot.gameCount
              ? `Lock in ${remaining.length || ""}`.trim()
              : "Start elimination"}
          </Button>
        </div>
      )}

      {/* ---- Eliminating ---- */}
      {slot.pickState === "eliminating" && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            {voting?.summary} · {voterCount} of {bundle.attendees.length} voted
          </p>
          <p className="text-muted-foreground/70 text-xs">
            Fist-bump anything you'd play and sad-face anything you wouldn't — that's not a vote,
            it shows who's up for what, and only ever breaks a tie.
          </p>
          {remaining.map((n) => {
            const game = gameById(n.gameId);
            const approvers = slotApprovals.filter((a) => a.gameId === n.gameId);
            const mine = myApprovals.has(n.gameId);
            const atLimit = !mine && myApprovals.size >= maxApprovals;
            return (
              <div
                key={n.gameId}
                className={cn(
                  "flex flex-col rounded-md border transition-colors",
                  mine ? "border-primary bg-primary/10" : undefined,
                )}
              >
                <button
                  type="button"
                  disabled={atLimit || m.approve.isPending}
                  onClick={() => m.approve.mutate(n.gameId)}
                  title={
                    atLimit
                      ? `You can approve ${maxApprovals} game${maxApprovals === 1 ? "" : "s"} this round`
                      : undefined
                  }
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md p-2 text-left transition-colors disabled:opacity-50",
                    mine ? undefined : atLimit ? "cursor-not-allowed" : "hover:bg-muted",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border",
                        mine ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                      )}
                    >
                      {mine && <Check className="size-3.5" />}
                    </span>
                    {game?.thumbnailUrl && (
                      <img src={game.thumbnailUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
                    )}
                    <span className="min-w-0 truncate text-sm font-medium">
                      {game?.title}
                      {n.expansionGameIds.length > 0 && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          + {expansionNames(n.expansionGameIds).join(", ")}
                        </span>
                      )}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        ({n.minPlayers}–{n.maxPlayers}p)
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="flex -space-x-1.5">
                      {approvers.map((a) => {
                        const u = bundle.attendees.find((x) => x.id === a.userId);
                        return u ? (
                          <UserAvatar key={a.userId} user={u} className="ring-background size-5 ring-1" />
                        ) : null;
                      })}
                    </span>
                    <Badge
                      variant={atRisk.has(n.gameId) ? "outline" : "secondary"}
                      className="text-[10px]"
                    >
                      {approvers.length}
                    </Badge>
                  </div>
                </button>
                {/* Outside the approve button — nesting buttons is invalid
                    HTML. Still live once you've spent all your approvals,
                    which is exactly when "I'd still play it" is worth saying. */}
                <div className="px-2 pb-2">
                  <InterestButtons
                    eventId={eventId}
                    slotId={slot.id}
                    gameId={n.gameId}
                    interest={interestIn(n.gameId)}
                    attendees={bundle.attendees}
                    meId={me?.id}
                  />
                </div>
              </div>
            );
          })}

          {eliminated.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {eliminated.map((n) => (
                <span
                  key={n.gameId}
                  className="text-muted-foreground/60 text-xs line-through"
                  title={`out in round ${n.eliminatedRound}`}
                >
                  {gameById(n.gameId)?.title}
                </span>
              ))}
            </div>
          )}

          {actionError && <p className="text-destructive text-xs">{actionError}</p>}

          {plan?.outcome === "cut" && plan.decidedBy === "interest" && (
            <p className="text-muted-foreground text-xs">
              Tied on votes at the cut — fist bumps decide what goes.
            </p>
          )}
          {plan?.outcome === "tie" && (
            <p className="text-muted-foreground text-xs">
              Tied on votes and fist bumps at the cut — someone needs to change their mind.
            </p>
          )}

          <Button
            size="sm"
            disabled={!canAdvance || m.advance.isPending}
            onClick={() => m.advance.mutate()}
          >
            <ChevronRight />
            {plan?.outcome === "cut"
              ? `Drop ${plan.gameIds.length} low game${plan.gameIds.length === 1 ? "" : "s"}`
              : plan?.outcome === "tie"
                ? "Tied — vote again"
                : "Waiting for votes"}
          </Button>
        </div>
      )}

      {/* ---- Decided ---- */}
      {slot.pickState === "decided" && (
        <div className="flex flex-col gap-2">
          {plays.map((play) => {
            const game = gameById(play.gameId);
            return (
              <div
                key={play.id}
                className="group bg-muted/50 hover:bg-muted flex cursor-pointer flex-col gap-1.5 rounded-md p-2"
                onClick={() => setPlayDialog({ play })}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    {game?.thumbnailUrl && (
                      <img src={game.thumbnailUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{game?.title}</p>
                      {expansionNames(play.expansionGameIds).map((name) => (
                        <p key={name} className="text-muted-foreground truncate text-xs">
                          + {name}
                        </p>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title="Remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      m.removePlay.mutate(play.id);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
                {play.playerIds.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {/* Ranked plays are in finishing order, so the avatars read
                        left to right as the result. */}
                    <div className="flex -space-x-1.5">
                      {play.playerIds.map((pid, i) => {
                        const a = bundle.attendees.find((x) => x.id === pid);
                        return a ? (
                          <UserAvatar
                            key={pid}
                            user={a}
                            className="ring-background size-5 ring-1"
                            title={play.ranked ? `${ordinal(i + 1)} — ${fullName(a)}` : undefined}
                          />
                        ) : null;
                      })}
                    </div>
                    {play.ranked && winnerName(play) && (
                      <span className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Trophy className="size-3 text-amber-500" />
                        {winnerName(play)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">Tap to add players</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {playDialog && (
        <PlayDialog
          eventId={eventId}
          bundle={bundle}
          slot={slot}
          play={playDialog.play}
          onClose={() => setPlayDialog(null)}
        />
      )}
      {editOpen && (
        <SessionDialog
          eventId={eventId}
          day={slot.day}
          slot={slot}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
