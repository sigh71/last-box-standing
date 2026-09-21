import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Package } from "lucide-react";
import SearchInput from "@/components/SearchInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { searchLibrary, updateAvailableGames, type EventBundle } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Choose which games were actually brought to this weekend.
 *
 * Selecting none is the normal state, not an error: with no shortlist the
 * nomination picker offers the whole library, which is how this worked before
 * the list existed. So the primary action stays available when nothing is
 * ticked — that's how you clear a shortlist you no longer want.
 */
export default function AvailableGamesDialog({
  bundle,
  onClose,
}: {
  bundle: EventBundle;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>(bundle.availableGameIds);

  // The whole library, so a shortlist can reach past the typeahead's cap.
  const { data: games, isLoading } = useQuery({
    queryKey: ["library", "all"],
    queryFn: () => searchLibrary("", "all"),
  });

  const save = useMutation({
    mutationFn: () => updateAvailableGames(bundle.event.id, selected),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["event", bundle.event.id] });
      onClose();
    },
  });

  const q = query.trim().toLowerCase();
  const shown = (games ?? [])
    .filter((g) => g.bggType !== "boardgameexpansion")
    .filter((g) => !q || g.title.toLowerCase().includes(q));

  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Games at this weekend</DialogTitle>
          <DialogDescription>
            Pick what's coming and the nomination picker will offer only those. Leave
            nothing selected to allow the whole library.
          </DialogDescription>
        </DialogHeader>

        <SearchInput placeholder="Filter games…" value={query} onValueChange={setQuery} />

        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {isLoading && <p className="text-muted-foreground p-2 text-sm">Loading…</p>}
          {!isLoading && shown.length === 0 && (
            <p className="text-muted-foreground p-2 text-sm">No games match.</p>
          )}
          {shown.map((g) => {
            const on = selected.includes(g.id);
            const copies = g.copies?.length ?? 0;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggle(g.id)}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors sm:py-1.5",
                  on ? "bg-primary/10" : "hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded border",
                    on && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {on && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{g.title}</span>
                {copies > 0 && (
                  <span
                    className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs"
                    title={`${copies} copy${copies === 1 ? "" : "ies"} recorded`}
                  >
                    <Package className="size-3" />
                    {copies}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <DialogFooter className="sm:justify-between">
          <span className="text-muted-foreground self-center text-xs">
            {selected.length === 0
              ? "Whole library available"
              : `${selected.length} game${selected.length === 1 ? "" : "s"} selected`}
          </span>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
