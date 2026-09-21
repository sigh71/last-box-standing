import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteEvent, type EventBundle } from "@/lib/api";

/** Typed exactly, in capitals, before the button will do anything. */
const CONFIRM_WORD = "DELETE";

/**
 * Confirms deleting a weekend.
 *
 * The rows are really gone afterwards and there is no undo, so this is
 * deliberately awkward: it counts up what goes with the weekend and makes the
 * admin type the word out. The recorded plays are the part worth pausing over —
 * they're the only record of what the group actually played and who was there.
 */
export default function DeleteEventDialog({
  bundle,
  onClose,
}: {
  bundle: EventBundle;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");

  const remove = useMutation({
    mutationFn: () => deleteEvent(bundle.event.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.removeQueries({ queryKey: ["event", bundle.event.id] });
      // Nothing left to look at on this page.
      navigate("/", { replace: true });
    },
  });

  // Case must match — but stray whitespace from a paste shouldn't block a
  // correct answer.
  const confirmed = typed.trim() === CONFIRM_WORD;
  const busy = remove.isPending;

  const counts = [
    [bundle.slots.length, "session"],
    [bundle.nominations.length, "nominated game"],
    [bundle.plays.length, "recorded play"],
  ] as const;
  const losing = counts.filter(([n]) => n > 0);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="text-destructive size-5" />
            Delete “{bundle.event.name}”?
          </DialogTitle>
          <DialogDescription>
            This deletes the weekend for everyone, permanently. It can't be undone.
          </DialogDescription>
        </DialogHeader>

        {losing.length > 0 && (
          <div className="border-destructive/40 bg-destructive/5 rounded-md border p-3 text-sm">
            <p className="font-medium">Deleted along with it:</p>
            <ul className="mt-1 list-inside list-disc">
              {losing.map(([n, noun]) => (
                <li key={noun}>
                  {n} {noun}
                  {n === 1 ? "" : "s"}
                  {noun === "recorded play" && (
                    <span className="text-muted-foreground"> — what was played, and by whom</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-2">The game library isn't affected.</p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmed && !busy) remove.mutate();
          }}
          className="flex flex-col gap-2"
        >
          <Label htmlFor="confirm-delete">
            Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
          </Label>
          <Input
            id="confirm-delete"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_WORD}
            disabled={busy}
          />
        </form>

        {remove.isError && (
          <p className="text-destructive text-sm">
            {remove.error instanceof Error ? remove.error.message : "Delete failed."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={!confirmed || busy}
            title={confirmed ? undefined : `Type ${CONFIRM_WORD} to enable`}
          >
            {busy && <Loader2 className="animate-spin" />}
            Delete this weekend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
