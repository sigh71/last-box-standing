import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import UserAvatar from "@/components/UserAvatar";
import { listUsers, updateAttendees, type Attendee } from "@/lib/api";
import { firstName } from "@/lib/names";
import { cn } from "@/lib/utils";

/** Choose who's coming to this weekend, from everyone with access. */
export default function AttendeesDialog({
  eventId,
  attendees,
  onClose,
}: {
  eventId: number;
  attendees: Attendee[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number[]>(attendees.map((a) => a.id));

  const { data: allUsers } = useQuery({ queryKey: ["users"], queryFn: listUsers });

  // Anyone can change who's coming, so everyone gets the whole roster to pick
  // from: gating this on isAdmin meant a non-admin could only ever remove
  // people, never add one. The attendees stand in while the roster loads.
  const roster = allUsers
    ?.filter((u) => u.deactivatedAt === null)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl }));
  const people = roster ?? attendees;

  const save = useMutation({
    mutationFn: () => updateAttendees(eventId, selected),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      onClose();
    },
  });

  function toggle(id: number) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who's coming?</DialogTitle>
          <DialogDescription>
            Attendees nominate and vote, and make up the "x of y voted" count on each
            session.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {people.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <UserAvatar user={p} className="size-6" />
                {firstName(p)}
              </button>
            );
          })}
        </div>

        {save.isError && (
          <p className="text-destructive text-sm">{(save.error as Error).message}</p>
        )}

        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
