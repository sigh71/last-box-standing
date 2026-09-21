import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Trophy } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { type Attendee } from "@/lib/api";
import { firstName } from "@/lib/names";
import { cn } from "@/lib/utils";

/** 1 → "1st", 2 → "2nd" … including the 11th/12th/13th exceptions. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/**
 * Drag the players into finishing order, first place at the top.
 *
 * Uses pointer events rather than HTML5 drag-and-drop, which doesn't fire on
 * touch at all — and this gets used on a phone at the table, right after the
 * game ends. `touch-action: none` on the handle stops the drag scrolling the
 * page instead of moving the row.
 *
 * Dragging is not reachable by keyboard, so every row also carries move
 * up/down buttons; they're the accessible path, not a lesser one.
 */
export default function SortablePlayers({
  players,
  onReorder,
}: {
  players: Attendee[];
  onReorder: (ids: number[]) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const ids = players.map((p) => p.id);

  function reorderTo(from: number, to: number) {
    if (to === from || to < 0 || to >= ids.length) return;
    onReorder(move(ids, from, to));
  }

  function onPointerMove(e: React.PointerEvent) {
    if (draggingId == null || !listRef.current) return;
    const rows = Array.from(
      listRef.current.querySelectorAll<HTMLElement>("[data-player-row]"),
    );
    if (rows.length === 0) return;

    const from = ids.indexOf(draggingId);
    const y = e.clientY;
    let to = from;

    const firstRect = rows[0]!.getBoundingClientRect();
    const lastRect = rows[rows.length - 1]!.getBoundingClientRect();
    if (y <= firstRect.top) {
      to = 0;
    } else if (y >= lastRect.bottom) {
      to = rows.length - 1;
    } else {
      to = rows.findIndex((row) => {
        const r = row.getBoundingClientRect();
        return y >= r.top && y <= r.bottom;
      });
    }
    if (to !== -1) reorderTo(from, to);
  }

  return (
    <ul ref={listRef} className="flex flex-col gap-1">
      {players.map((p, i) => (
        <li
          key={p.id}
          data-player-row
          className={cn(
            "bg-background flex items-center gap-2 rounded-md border p-1.5",
            draggingId === p.id && "border-primary shadow-sm",
          )}
        >
          <span
            role="button"
            aria-label={`Drag ${firstName(p)}`}
            className="text-muted-foreground hover:text-foreground cursor-grab touch-none p-1"
            onPointerDown={(e) => {
              e.preventDefault();
              // Capture keeps the moves coming to this handle even when the
              // finger outruns the row. It throws if the pointer is already
              // gone, which must not abort the drag we're starting.
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* capture is an optimisation, not a requirement */
              }
              setDraggingId(p.id);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => {
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                /* already released */
              }
              setDraggingId(null);
            }}
            onPointerCancel={() => setDraggingId(null)}
          >
            <GripVertical className="size-4" />
          </span>

          <span
            className={cn(
              "w-9 shrink-0 text-xs font-medium tabular-nums",
              i === 0 ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {ordinal(i + 1)}
          </span>

          <UserAvatar user={p} className="size-6 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm">{firstName(p)}</span>
          {i === 0 && <Trophy className="size-3.5 shrink-0 text-amber-500" />}

          <span className="flex shrink-0">
            <button
              type="button"
              aria-label={`Move ${firstName(p)} up`}
              className="hover:bg-muted disabled:opacity-30 rounded p-1"
              disabled={i === 0}
              onClick={() => reorderTo(i, i - 1)}
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Move ${firstName(p)} down`}
              className="hover:bg-muted disabled:opacity-30 rounded p-1"
              disabled={i === players.length - 1}
              onClick={() => reorderTo(i, i + 1)}
            >
              <ChevronDown className="size-4" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
