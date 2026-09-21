/**
 * Live updates for the event page, as a plain in-process fan-out.
 *
 * Voting is the reason this exists: several people are looking at the same
 * session while approvals come in, and a stale page makes them vote against
 * numbers that have already moved.
 *
 * Deliberately just a doorbell. A subscriber is told *that* its event changed,
 * never what changed — the client refetches the event bundle, which stays the
 * single source of truth, so there is no second copy of the domain logic here
 * and no chance of pushing rows to someone who shouldn't see them.
 *
 * Listeners live in this process's memory, which is correct for a deployment of
 * one container per group. Run two replicas and each would only notify its own
 * half; that's the point where this needs an out-of-process bus.
 */

type Listener = () => void;

const listeners = new Map<number, Set<Listener>>();

/** Registers a listener for one event. Returns the unsubscribe. */
export function subscribe(eventId: number, fn: Listener): () => void {
  let forEvent = listeners.get(eventId);
  if (!forEvent) {
    forEvent = new Set();
    listeners.set(eventId, forEvent);
  }
  forEvent.add(fn);

  return () => {
    const set = listeners.get(eventId);
    if (!set) return;
    set.delete(fn);
    // Don't leave an empty set behind for every event ever opened.
    if (set.size === 0) listeners.delete(eventId);
  };
}

/** Tells everyone watching this event that something changed. */
export function publish(eventId: number): void {
  for (const fn of listeners.get(eventId) ?? []) {
    try {
      fn();
    } catch (err) {
      // One broken stream must not stop the others being notified.
      console.error(`Live update failed for event ${eventId}:`, err);
    }
  }
}

/** Number of open streams, for the health check. */
export function watcherCount(): number {
  let n = 0;
  for (const set of listeners.values()) n += set.size;
  return n;
}
