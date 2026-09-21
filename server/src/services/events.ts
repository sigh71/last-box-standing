import { db } from "../db/index.js";
import { events, eventAttendees, type Event } from "../db/schema.js";

/** Each ISO date from start to end inclusive. */
export function eachDay(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const end = new Date(`${endDate}T00:00:00Z`);
  const cur = new Date(`${startDate}T00:00:00Z`);
  while (cur <= end && days.length < 31) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/**
 * Creates an event and its attendee rows. Sessions are added by the user
 * afterwards (each with its own 1- or 2-game count), not auto-generated.
 */
export function createEvent(opts: {
  name: string;
  startDate: string;
  endDate: string;
  createdBy: number;
  attendeeIds: number[];
}): Event {
  const event = db
    .insert(events)
    .values({
      name: opts.name,
      startDate: opts.startDate,
      endDate: opts.endDate,
      createdBy: opts.createdBy,
    })
    .returning()
    .get();

  if (opts.attendeeIds.length > 0) {
    db.insert(eventAttendees)
      .values(opts.attendeeIds.map((userId) => ({ eventId: event.id, userId })))
      .run();
  }

  return event;
}
