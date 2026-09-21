import { useMemo } from "react";

const COLORS = [
  "oklch(0.85 0.16 90)",
  "oklch(0.75 0.2 25)",
  "oklch(0.78 0.17 145)",
  "oklch(0.72 0.16 250)",
  "oklch(0.8 0.15 330)",
  "oklch(0.95 0.02 90)",
];

/**
 * Confetti as ~120 absolutely positioned divs falling on a CSS keyframe.
 *
 * A canvas particle loop would look marginally better and cost a
 * requestAnimationFrame running for the length of the reveal; this is handed
 * to the compositor and left alone, which matters because the machine driving
 * the TV is as likely to be a spare laptop as anything.
 */
export default function Confetti({ pieces = 120 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        key: i,
        left: `${Math.random() * 100}%`,
        color: COLORS[i % COLORS.length]!,
        drift: `${(Math.random() - 0.5) * 40}vw`,
        spin: `${(Math.random() - 0.5) * 1600}deg`,
        duration: `${2.6 + Math.random() * 3.4}s`,
        delay: `${Math.random() * 1.6}s`,
        wide: Math.random() < 0.25,
      })),
    [pieces],
  );

  return (
    <div className="bs-confetti" aria-hidden>
      {bits.map((b) => (
        <i
          key={b.key}
          style={
            {
              left: b.left,
              "--c": b.color,
              "--drift": b.drift,
              "--spin": b.spin,
              "--dur": b.duration,
              "--delay": b.delay,
              ...(b.wide ? { width: "1.6vmin", height: "0.7vmin", borderRadius: "0.4vmin" } : null),
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
