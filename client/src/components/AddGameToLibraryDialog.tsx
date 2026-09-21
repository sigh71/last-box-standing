import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus } from "lucide-react";
import SearchInput from "@/components/SearchInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addToLibrary, bggSearch, searchLibrary } from "@/lib/api";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Add a game to the library directly. Expansions can be added the same way —
 * the server pulls in their base game too and links them.
 */
export default function AddGameToLibraryDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 400);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["library"] });

  const { data: owned } = useQuery({
    queryKey: ["library", "all"],
    queryFn: () => searchLibrary("", "all"),
    enabled: open,
  });
  const search = useQuery({
    queryKey: ["bgg-search", debouncedQuery],
    queryFn: () => bggSearch(debouncedQuery),
    enabled: open && debouncedQuery.trim().length >= 2,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const ownedBggIds = new Set((owned ?? []).map((g) => g.bggId).filter(Boolean));

  const add = useMutation({
    mutationFn: addToLibrary,
    onSuccess: () => {
      void invalidate();
    },
    onSettled: () => setAddingId(null),
  });

  const [manual, setManual] = useState({
    title: "",
    minPlayers: "2",
    maxPlayers: "6",
    playtimeMinutes: "",
    length: "short" as "long" | "short",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add game
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a game to the library</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="bgg">
          <TabsList className="w-full">
            <TabsTrigger value="bgg">BoardGameGeek</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>

          <TabsContent value="bgg" className="flex flex-col gap-3 pt-2">
            <SearchInput
              autoFocus
              placeholder="Search BoardGameGeek — expansions too…"
              value={query}
              onValueChange={setQuery}
            />
            {!search.isFetching && (search.data?.length ?? 0) > 0 && (
              <p className="text-muted-foreground px-2 text-xs">
                {search.data?.length} result{search.data?.length === 1 ? "" : "s"} — big
                families like Munchkin run long; add a year to narrow it (e.g. “Munchkin 2011”).
              </p>
            )}
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {search.isFetching && (
                <p className="text-muted-foreground flex items-center gap-2 p-2 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Searching…
                </p>
              )}
              {search.data?.map((r) => {
                const have = ownedBggIds.has(r.bggId);
                return (
                  <button
                    key={r.bggId}
                    type="button"
                    disabled={addingId != null || have}
                    onClick={() => {
                      setAddingId(r.bggId);
                      add.mutate(
                        { bggId: r.bggId },
                        { onSuccess: () => setAdded((c) => new Set(c).add(r.bggId)) },
                      );
                    }}
                    className="hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-60"
                  >
                    <span>
                      {r.title}
                      {r.year && <span className="text-muted-foreground"> ({r.year})</span>}
                    </span>
                    {addingId === r.bggId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : have || added.has(r.bggId) ? (
                      <span className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Check className="size-3.5" /> In library
                      </span>
                    ) : (
                      <Plus className="text-muted-foreground size-4" />
                    )}
                  </button>
                );
              })}
              {debouncedQuery.trim().length >= 2 &&
                search.data?.length === 0 &&
                !search.isFetching && (
                  <p className="text-muted-foreground p-2 text-sm">No matches.</p>
                )}
              {search.isError && (
                <p className="bg-destructive/10 text-destructive rounded-md p-2 text-sm">
                  {(search.error as Error).message}
                </p>
              )}
              {add.isError && (
                <p className="bg-destructive/10 text-destructive rounded-md p-2 text-sm">
                  {(add.error as Error).message}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="manual" className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="lg-title">Title</Label>
              <Input
                id="lg-title"
                value={manual.title}
                onChange={(e) => setManual({ ...manual, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="lg-min">Min players</Label>
                <Input
                  id="lg-min"
                  type="number"
                  min={1}
                  value={manual.minPlayers}
                  onChange={(e) => setManual({ ...manual, minPlayers: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lg-max">Max players</Label>
                <Input
                  id="lg-max"
                  type="number"
                  min={1}
                  value={manual.maxPlayers}
                  onChange={(e) => setManual({ ...manual, maxPlayers: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lg-time">Minutes</Label>
                <Input
                  id="lg-time"
                  type="number"
                  min={0}
                  placeholder="90"
                  value={manual.playtimeMinutes}
                  onChange={(e) => setManual({ ...manual, playtimeMinutes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!manual.title.trim() || add.isPending}
                onClick={() =>
                  add.mutate(
                    {
                      game: {
                        title: manual.title.trim(),
                        minPlayers: Number(manual.minPlayers) || 1,
                        maxPlayers: Number(manual.maxPlayers) || 99,
                        playtimeMinutes: manual.playtimeMinutes
                          ? Number(manual.playtimeMinutes)
                          : null,
                        length: manual.length,
                      },
                    },
                    { onSuccess: () => setManual({ ...manual, title: "", playtimeMinutes: "" }) },
                  )
                }
              >
                Add to library
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
