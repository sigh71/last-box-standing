import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import SessionCard from "@/components/SessionCard";
import SessionDialog from "@/components/SessionDialog";
import { eachDay, fmtDay } from "@/lib/dates";
import type { EventBundle } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Days side by side on a wide screen; on a phone one day fills the width and
 * you swipe between them (CSS scroll snapping — no gesture library needed).
 */
export default function ScheduleTab({
  eventId,
  bundle,
}: {
  eventId: number;
  bundle: EventBundle;
}) {
  const days = eachDay(bundle.event.startDate, bundle.event.endDate);
  const [addDay, setAddDay] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  /**
   * Scroll a day into view by measured offset rather than an assumed page
   * width — gaps and edge padding make arithmetic on scrollWidth wrong, and
   * scrollTo({behavior:"smooth"}) is a no-op in some environments. Smoothness
   * comes from the container's scroll-smooth class instead.
   */
  const goTo = (index: number) => {
    const el = scroller.current;
    const i = Math.max(0, Math.min(days.length - 1, index));
    const child = el?.children[i] as HTMLElement | undefined;
    if (!el || !child) return;
    el.scrollLeft += child.getBoundingClientRect().left - el.getBoundingClientRect().left;
    setCurrent(i);
  };

  /** Keep the indicator honest while swiping: whichever day is nearest the left edge. */
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const left = el.getBoundingClientRect().left;
    let nearest = 0;
    let best = Infinity;
    [...el.children].forEach((child, i) => {
      const distance = Math.abs((child as HTMLElement).getBoundingClientRect().left - left);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    if (nearest !== current) setCurrent(nearest);
  };

  return (
    <>
      {/* Day pager — phones only. */}
      {days.length > 1 && (
        <div className="mb-3 flex items-center justify-between gap-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous day"
            disabled={current === 0}
            onClick={() => goTo(current - 1)}
          >
            <ChevronLeft />
          </Button>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-semibold">{fmtDay(days[current] ?? days[0]!)}</span>
            <div className="flex gap-1.5">
              {days.map((day, i) => (
                <button
                  key={day}
                  type="button"
                  aria-label={`Go to ${fmtDay(day)}`}
                  onClick={() => goTo(i)}
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    i === current ? "bg-foreground" : "bg-muted-foreground/30",
                  )}
                />
              ))}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next day"
            disabled={current === days.length - 1}
            onClick={() => goTo(current + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}

      <div
        ref={scroller}
        onScroll={onScroll}
        className={cn(
          // Phone: one full-width day per swipe, bleeding to the screen edges.
          "-mx-4 flex snap-x snap-mandatory scroll-smooth gap-4 overflow-x-auto px-4 pb-2",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Wider: an ordinary column per day, no scrolling.
          "md:mx-0 md:grid md:snap-none md:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] md:overflow-visible md:px-0 md:pb-0",
        )}
      >
        {days.map((day) => {
          const sessions = bundle.slots
            .filter((s) => s.day === day)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <div
              key={day}
              className="flex w-full shrink-0 snap-center flex-col gap-3 md:w-auto md:min-w-0 md:shrink"
            >
              {/* The pager already names the day on a phone. */}
              <h3 className="hidden text-sm font-semibold md:block">{fmtDay(day)}</h3>
              {sessions.map((slot) => (
                <SessionCard key={slot.id} eventId={eventId} bundle={bundle} slot={slot} />
              ))}
              {sessions.length === 0 && (
                <p className="text-muted-foreground/60 text-xs">No sessions yet</p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="border-dashed"
                onClick={() => setAddDay(day)}
              >
                <Plus /> Add session
              </Button>
            </div>
          );
        })}
      </div>

      {addDay && (
        <SessionDialog eventId={eventId} day={addDay} onClose={() => setAddDay(null)} />
      )}
    </>
  );
}
