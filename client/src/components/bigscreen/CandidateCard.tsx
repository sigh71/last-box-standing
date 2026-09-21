import UserAvatar from "@/components/UserAvatar";
import type { Attendee, Game, Nomination } from "@/lib/api";
import { firstName } from "@/lib/names";
import { cn } from "@/lib/utils";

/** How a card is playing its part in the current moment. */
export type CardMood = "plain" | "lead" | "risk" | "doomed" | "cut" | "spared";

/**
 * One game in the running, sized to be read from across a room: the title
 * dominates, the vote count is the second thing your eye lands on, and the box
 * art is knocked back to a texture behind both.
 */
export default function CandidateCard({
  game,
  nomination,
  expansions,
  approvers,
  voterCount,
  mood,
  showVotes,
  nominator,
}: {
  game: Game | undefined;
  nomination: Nomination;
  expansions: string[];
  approvers: Attendee[];
  /** People expected to vote, for the fill of the support bar. */
  voterCount: number;
  mood: CardMood;
  showVotes: boolean;
  /** Shown while nominating, when there are no votes to show yet. */
  nominator?: Attendee;
}) {
  const votes = approvers.length;
  const art = game?.imageUrl ?? game?.thumbnailUrl;

  return (
    <div
      className={cn(
        "bs-card",
        mood === "lead" && "bs-card-lead",
        mood === "risk" && "bs-card-risk",
        mood === "doomed" && "bs-card-doomed",
        mood === "cut" && "bs-card-cut",
        mood === "spared" && "bs-card-spared",
      )}
    >
      {art && <img src={art} alt="" className="bs-card-art" />}

      {mood === "cut" && (
        <div className="bs-stamp">
          <span>OUT</span>
        </div>
      )}

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col justify-between gap-[1.5vmin] p-[2vmin]">
        <div className="min-h-0">
          <p className="line-clamp-3 text-[clamp(1rem,2.9vmin,3rem)] leading-[1.05] font-black tracking-tight">
            {game?.title ?? "Unknown game"}
          </p>
          {expansions.length > 0 && (
            <p className="mt-[0.6vmin] line-clamp-2 text-[clamp(0.7rem,1.5vmin,1.4rem)] text-[var(--bs-gold)]/80">
              + {expansions.join(" + ")}
            </p>
          )}
          <p className="mt-[0.6vmin] text-[clamp(0.65rem,1.4vmin,1.3rem)] text-[var(--bs-dim)]">
            {nomination.minPlayers}–{nomination.maxPlayers} players
            {nominator && ` · ${firstName(nominator)}`}
          </p>
        </div>

        {showVotes && (
          <div className="flex flex-col gap-[1vmin]">
            <div className="flex items-end justify-between gap-[1vmin]">
              <span className="flex -space-x-[0.8vmin]">
                {approvers.map((a) => (
                  <UserAvatar
                    key={a.id}
                    user={a}
                    className="size-[max(1.25rem,3.4vmin)] ring-1 ring-white/40"
                  />
                ))}
              </span>
              {/* Keyed on the count so the pop replays every time it moves. */}
              <span
                key={votes}
                className={cn(
                  "bs-votes text-[clamp(1.5rem,5vmin,5rem)] leading-none font-black",
                  votes <= 1 ? "text-[var(--bs-risk)]" : "text-[var(--bs-live)]",
                )}
              >
                {votes}
              </span>
            </div>
            <div className="h-[0.9vmin] min-h-[4px] overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "bs-bar h-full rounded-full",
                  votes <= 1 ? "bg-[var(--bs-risk)]" : "bg-[var(--bs-live)]",
                )}
                style={{ width: `${voterCount > 0 ? (votes / voterCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
