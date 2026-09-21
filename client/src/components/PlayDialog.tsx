import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import UserAvatar from "@/components/UserAvatar";
import SortablePlayers from "@/components/SortablePlayers";
import {
  createPlay,
  updatePlay,
  type EventBundle,
  type Play,
  type Slot,
} from "@/lib/api";
import { firstName } from "@/lib/names";
import { cn } from "@/lib/utils";

export default function PlayDialog({
  eventId,
  bundle,
  slot,
  play,
  onClose,
}: {
  eventId: number;
  bundle: EventBundle;
  slot: Slot;
  play?: Play;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [gameId, setGameId] = useState<string>(play ? String(play.gameId) : "");
  const [playerIds, setPlayerIds] = useState<number[]>(play?.playerIds ?? []);
  // Off until someone says otherwise: a seated table isn't a result, and
  // guessing that it is would quietly invent winners.
  const [ranked, setRanked] = useState(play?.ranked ?? false);

  const save = useMutation({
    mutationFn: () =>
      play
        ? updatePlay(play.id, { gameId: Number(gameId), playerIds, ranked })
        : createPlay(slot.id, { gameId: Number(gameId), playerIds, ranked }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      onClose();
    },
  });

  function togglePlayer(id: number) {
    // Added players go on the end, so toggling someone in never silently
    // rewrites a finishing order that's already been arranged.
    setPlayerIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  // Ordered to match playerIds — that order is the result once `ranked`.
  const selectedPlayers = playerIds.flatMap((id) => {
    const a = bundle.attendees.find((x) => x.id === id);
    return a ? [a] : [];
  });

  const game = bundle.games.find((g) => g.id === Number(gameId));
  // While editing the game this play already has, its expansions count towards
  // the seating; picking a different game falls back to that game's own range.
  const range =
    play && Number(gameId) === play.gameId
      ? { minPlayers: play.minPlayers, maxPlayers: play.maxPlayers }
      : game
        ? { minPlayers: game.minPlayers, maxPlayers: game.maxPlayers }
        : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {play ? "Edit" : "Add"} game — {slot.label}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Game</Label>
            <Select value={gameId} onValueChange={setGameId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a proposed game" />
              </SelectTrigger>
              <SelectContent>
                {bundle.games.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.title} ({g.minPlayers}–{g.maxPlayers}p)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Players</Label>
            <div className="flex flex-wrap gap-2">
              {bundle.attendees.map((a) => {
                const selected = playerIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => togglePlayer(a.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    <UserAvatar user={a} className="size-6" />
                    {firstName(a)}
                  </button>
                );
              })}
            </div>
            {game && range && (
              <p
                className={cn(
                  "text-xs",
                  playerIds.length < range.minPlayers || playerIds.length > range.maxPlayers
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {playerIds.length} selected · {game.title}
                {play && Number(gameId) === play.gameId && play.expansionGameIds.length > 0
                  ? " with its expansions"
                  : ""}{" "}
                takes {range.minPlayers}–{range.maxPlayers}
              </p>
            )}
          </div>

          {playerIds.length >= 2 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="record-result">Finishing order</Label>
                <button
                  id="record-result"
                  type="button"
                  role="switch"
                  aria-checked={ranked}
                  onClick={() => setRanked((r) => !r)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    ranked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground",
                  )}
                >
                  {ranked ? "Recording result" : "Record result"}
                </button>
              </div>

              {ranked ? (
                <>
                  <p className="text-muted-foreground text-xs">
                    Drag into the order they finished — winner at the top.
                  </p>
                  <SortablePlayers players={selectedPlayers} onReorder={setPlayerIds} />
                </>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Turn this on once you know who won, and drag them into order.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!gameId || save.isPending}>
            {play ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
