import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSession, updateSession, type Slot } from "@/lib/api";
import { fmtDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Create a session on `day`, or edit an existing `slot`. */
export default function SessionDialog({
  eventId,
  day,
  slot,
  onClose,
}: {
  eventId: number;
  day: string;
  slot?: Slot;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(slot?.label ?? "");
  const [gameCount, setGameCount] = useState<number>(slot?.gameCount ?? 1);

  const save = useMutation({
    mutationFn: () =>
      slot
        ? updateSession(eventId, slot.id, { label: label.trim(), gameCount })
        : createSession(eventId, { day, label: label.trim(), gameCount }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{slot ? "Edit session" : `New session — ${fmtDay(day)}`}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="s-label">Name</Label>
            <Input
              id="s-label"
              autoFocus
              placeholder="e.g. Evening, After lunch…"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && label.trim()) save.mutate();
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>How many games?</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { n: 1, title: "1 game", sub: "Everyone plays together" },
                { n: 2, title: "2 games", sub: "Split into two tables" },
              ].map(({ n, title, sub }) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setGameCount(n)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-md border p-3 text-left transition-colors",
                    gameCount === n
                      ? "border-primary ring-primary/30 ring-2"
                      : "hover:bg-muted",
                  )}
                >
                  <span className="text-sm font-medium">{title}</span>
                  <span className="text-muted-foreground text-xs">{sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!label.trim() || save.isPending}>
            {slot ? "Save" : "Add session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
