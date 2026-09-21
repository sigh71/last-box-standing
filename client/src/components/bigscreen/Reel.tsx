import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A slot-machine reel that flicks through every game that was in the running
 * and lands on the one that won.
 *
 * The eliminated games are deliberately included: the point of the spin is
 * that for a second or two it could still be any of them.
 */
export default function Reel({
  labels,
  final,
  stopAt,
  offset = 0,
  className,
}: {
  /** Everything the reel may flash up on its way past. */
  labels: string[];
  /** Where it lands. */
  final: string;
  /** Milliseconds from mount until it locks. */
  stopAt: number;
  /**
   * Where in `labels` this reel starts. Two reels spinning the same pool from
   * the same index show the same title on every tick, which reads as a glitch
   * rather than as two reels; staggering them keeps them independent.
   */
  offset?: number;
  className?: string;
}) {
  const [label, setLabel] = useState(() => labels[offset % Math.max(1, labels.length)] ?? final);
  const [locked, setLocked] = useState(false);
  // The parent rebuilds this array every render; the spin shouldn't restart.
  const pool = useRef(labels);
  pool.current = labels.length > 0 ? labels : [final];

  useEffect(() => {
    let cancelled = false;
    let elapsed = 0;
    let i = offset;
    const timers: number[] = [];

    const step = () => {
      if (cancelled) return;
      // Ease out hard, so the last three or four names are actually readable
      // and the reel looks like it's fighting to stop.
      const progress = Math.min(1, elapsed / stopAt);
      const gap = 55 + 340 * progress ** 3;
      i += 1;
      setLabel(pool.current[i % pool.current.length] ?? final);
      elapsed += gap;
      if (elapsed >= stopAt) {
        setLabel(final);
        setLocked(true);
        return;
      }
      timers.push(window.setTimeout(step, gap));
    };

    timers.push(window.setTimeout(step, 60));
    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [final, stopAt, offset]);

  return (
    <div className={cn("bs-reel grid place-items-center px-[3vmin] py-[4vmin]", className)}>
      <span
        className={cn(
          // Two lines rather than an ellipsis: the title it lands on is the
          // whole point, and plenty of games have long ones.
          "block max-w-full text-center leading-[1.05] font-black tracking-tight",
          "line-clamp-2 text-[clamp(1.2rem,4.6vmin,5rem)]",
          locked ? "bs-reel-lock text-[var(--bs-gold)]" : "bs-reel-spin opacity-80",
        )}
      >
        {label}
      </span>
    </div>
  );
}
