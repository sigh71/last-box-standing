import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Frown, HandFist } from "lucide-react";
import {
  setInterest,
  type Attendee,
  type NominationInterest,
  type Stance,
} from "@/lib/api";
import { firstName } from "@/lib/names";
import { cn } from "@/lib/utils";

/**
 * "Would you actually play this?", asked in Rocky's words — a fist bump for
 * yes, "sad, sad, sad" for no.
 *
 * Deliberately not a vote. Approvals are capped at three a round and decide
 * *which* games survive; this is uncapped and answers the other question, of
 * who would sit down to what. That's the thing you need when a session runs
 * two tables and somebody has to work out who goes where, and it's why saying
 * "no" here costs a game nothing.
 */
export default function InterestButtons({
  eventId,
  slotId,
  gameId,
  interest,
  attendees,
  meId,
}: {
  eventId: number;
  slotId: number;
  gameId: number;
  /** Every stance recorded against this game in this session. */
  interest: NominationInterest[];
  attendees: Attendee[];
  meId: number | undefined;
}) {
  const queryClient = useQueryClient();
  const m = useMutation({
    mutationFn: (stance: Stance | null) => setInterest(slotId, gameId, stance),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event", eventId] }),
  });

  const ups = interest.filter((i) => i.stance === "up");
  const downs = interest.filter((i) => i.stance === "down");
  const mine = interest.find((i) => i.userId === meId)?.stance ?? null;

  // Rocky's highest praise, saved for the case that earns it: nobody coming
  // this weekend has anything but a fist bump for the game.
  const amaze = attendees.length > 0 && ups.length === attendees.length;

  const who = (rows: NominationInterest[]) =>
    rows
      .map((r) => attendees.find((a) => a.id === r.userId))
      .filter((a): a is Attendee => Boolean(a))
      .map(firstName);

  const label = (stance: Stance) => {
    const heading =
      stance === "up" ? "Fist my bump — I'd play this" : "Sad, sad, sad — I'd sit this one out";
    const names = who(stance === "up" ? ups : downs);
    return names.length > 0 ? `${heading}\n${names.join(", ")}` : heading;
  };

  // Sized like the card's other icon buttons: a comfortable target on the
  // phone this actually gets used on, tightened up on a pointer.
  const base =
    "flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs transition-colors disabled:opacity-50 sm:min-h-7 sm:px-2";

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        // Tapping your own stance again clears it: "ask me later" is a real
        // answer, and otherwise a mis-tap is permanent.
        onClick={() => m.mutate(mine === "up" ? null : "up")}
        disabled={m.isPending}
        title={label("up")}
        aria-label={label("up")}
        aria-pressed={mine === "up"}
        className={cn(
          base,
          mine === "up"
            ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground hover:bg-muted border-transparent",
        )}
      >
        <HandFist className="size-3.5" />
        {ups.length > 0 && <span className="tabular-nums">{ups.length}</span>}
      </button>

      <button
        type="button"
        onClick={() => m.mutate(mine === "down" ? null : "down")}
        disabled={m.isPending}
        title={label("down")}
        aria-label={label("down")}
        aria-pressed={mine === "down"}
        className={cn(
          base,
          mine === "down"
            ? "border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-400"
            : "text-muted-foreground hover:bg-muted border-transparent",
        )}
      >
        {/* A face, not an X: the card's withdraw button is already an X, and
            "I'd sit this out" must never look like "remove it". */}
        <Frown className="size-3.5" />
        {downs.length > 0 && <span className="tabular-nums">{downs.length}</span>}
      </button>

      {amaze && (
        <span className="text-[10px] font-semibold tracking-wide text-emerald-600 dark:text-emerald-400">
          Amaze, amaze, amaze!
        </span>
      )}
    </div>
  );
}
