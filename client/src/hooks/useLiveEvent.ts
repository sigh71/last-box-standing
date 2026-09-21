import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * How long without any message from the server before the stream is assumed
 * dead. The server pings every 25s, so a minute of silence is well past
 * "quiet" and into "this connection isn't really there any more".
 */
const STALE_AFTER_MS = 60_000;
const CHECK_EVERY_MS = 20_000;

/**
 * Keeps the event page in step with everyone else's votes.
 *
 * The server sends "something changed", never the change itself, so all this
 * does is invalidate the bundle and let the normal query path refetch it —
 * one code path for loading an event, not two. Cookies ride along because the
 * stream is same-origin, so it authenticates like every other request.
 *
 * EventSource retries by itself when it *notices* a broken connection, but a
 * connection can also die without the browser being told — a proxy that holds
 * the socket open after the server behind it restarts, a laptop coming back
 * from sleep. Those look OPEN and deliver nothing, which during a vote means
 * silently showing stale counts. So the server's heartbeat doubles as a
 * liveness check: too long without any message and we reconnect ourselves.
 */
export function useLiveEvent(eventId: number): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!Number.isInteger(eventId)) return;

    let source: EventSource | null = null;
    let lastMessageAt = Date.now();
    let stopped = false;

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    };

    const connect = () => {
      source?.close();
      source = new EventSource(`/api/events/${eventId}/stream`);
      lastMessageAt = Date.now();

      // Any traffic at all proves the connection is alive, heartbeats included.
      const touch = () => {
        lastMessageAt = Date.now();
      };
      source.addEventListener("ping", touch);
      source.addEventListener("ready", () => {
        touch();
        // A reconnect may have missed changes while it was down.
        refresh();
      });
      source.addEventListener("changed", () => {
        touch();
        refresh();
      });
    };

    connect();

    const watchdog = window.setInterval(() => {
      if (stopped) return;
      if (Date.now() - lastMessageAt > STALE_AFTER_MS) connect();
    }, CHECK_EVERY_MS);

    // Coming back to the tab is the moment a stale page is most visible, so
    // catch up immediately rather than waiting for the next check.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      if (Date.now() - lastMessageAt > STALE_AFTER_MS) connect();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisible);
      source?.close();
    };
  }, [eventId, queryClient]);
}
