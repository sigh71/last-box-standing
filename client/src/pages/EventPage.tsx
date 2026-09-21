import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Dices, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";
import ScheduleTab from "@/components/ScheduleTab";
import AttendeesDialog from "@/components/AttendeesDialog";
import DeleteEventDialog from "@/components/DeleteEventDialog";
import AvailableGamesDialog from "@/components/AvailableGamesDialog";
import { useLiveEvent } from "@/hooks/useLiveEvent";
import { ApiError, fetchMe, getEvent } from "@/lib/api";

export default function EventPage() {
  const id = Number(useParams().id);
  const [attendeesOpen, setAttendeesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const {
    data: bundle,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["event", id],
    queryFn: () => getEvent(id),
    enabled: Number.isInteger(id),
    // A deleted weekend is never coming back; retrying just delays saying so.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 3,
  });
  // Someone else's nomination or approval refreshes this page as it happens.
  useLiveEvent(id);

  // A refetch that 404s keeps the last good bundle in the cache, so an admin
  // deleting this weekend while someone reads it would otherwise leave them on
  // a page that no longer exists. Check the error, not just the data.
  const gone = error instanceof ApiError && error.status === 404;

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (gone || !bundle) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-muted-foreground">
          {gone ? "This weekend has been deleted." : "Event not found."}
        </p>
        <Link to="/" className="text-sm underline underline-offset-4">
          Back to weekends
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{bundle.event.name}</h1>
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <CalendarDays className="size-3.5" />
            {bundle.event.startDate} → {bundle.event.endDate}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGamesOpen(true)}
            title="Choose which games were brought this weekend"
          >
            <Dices className="size-4" />
            {bundle.availableGameIds.length > 0
              ? `${bundle.availableGameIds.length} games`
              : "All games"}
          </Button>

          <button
            type="button"
            onClick={() => setAttendeesOpen(true)}
            title="Edit who's coming"
            className="hover:bg-muted group flex items-center gap-2 rounded-full p-1 transition-colors"
          >
            <span className="flex -space-x-2">
              {bundle.attendees.map((a) => (
                <UserAvatar key={a.id} user={a} className="ring-background ring-2" />
              ))}
            </span>
            <UserCog className="text-muted-foreground group-hover:text-foreground size-4" />
          </button>

          {me?.isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              title="Delete this weekend"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <ScheduleTab eventId={id} bundle={bundle} />

      {gamesOpen && (
        <AvailableGamesDialog bundle={bundle} onClose={() => setGamesOpen(false)} />
      )}

      {deleteOpen && <DeleteEventDialog bundle={bundle} onClose={() => setDeleteOpen(false)} />}

      {attendeesOpen && (
        <AttendeesDialog
          eventId={id}
          attendees={bundle.attendees}
          onClose={() => setAttendeesOpen(false)}
        />
      )}
    </div>
  );
}
