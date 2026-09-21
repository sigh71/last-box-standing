import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Library, Loader2, Plus } from "lucide-react";
import SearchInput from "@/components/SearchInput";
import { Badge } from "@/components/ui/badge";
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
import { bggSearch, nominate, searchLibrary, type BggGame } from "@/lib/api";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Nominate a game into a session, via BGG search or manual entry. */
export default function NominateDialog({
  slotId,
  eventId,
  availableGameIds,
}: {
  slotId: number;
  eventId: number;
  /** The weekend's shortlist. Empty means the whole library is on offer. */
  availableGameIds: number[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["event", eventId] });

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 400);
  const [addingId, setAddingId] = useState<number | null>(null);
  /** Rows nominated during this dialog session (library ids and BGG ids). */
  const [added, setAdded] = useState<Set<number>>(new Set());

  const shortlisted = availableGameIds.length > 0;

  // The group's own games answer most searches without touching BoardGameGeek.
  // With a shortlist, ask for the whole library and narrow it here: the
  // typeahead's cap could otherwise hide a shortlisted game behind games that
  // aren't even on offer.
  const library = useQuery({
    queryKey: ["library", shortlisted ? "all" : debouncedQuery],
    queryFn: () => searchLibrary(shortlisted ? "" : debouncedQuery, shortlisted ? "all" : undefined),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const q = debouncedQuery.trim().toLowerCase();
  const libraryGames = (library.data ?? []).filter(
    (g) =>
      (!shortlisted || availableGameIds.includes(g.id)) &&
      (!shortlisted || !q || g.title.toLowerCase().includes(q)),
  );
  const search = useQuery({
    queryKey: ["bgg-search", debouncedQuery],
    queryFn: () => bggSearch(debouncedQuery),
    enabled: open && debouncedQuery.trim().length >= 2,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // Don't offer a BGG result we already hold in the library.
  const libraryBggIds = new Set((library.data ?? []).map((g) => g.bggId).filter(Boolean));
  const newToUs = (search.data ?? []).filter((r) => !libraryBggIds.has(r.bggId));

  const [manual, setManual] = useState({
    title: "",
    minPlayers: "2",
    maxPlayers: "6",
    playtimeMinutes: "",
    length: "short" as "long" | "short",
  });

  const nominateGame = useMutation({
    mutationFn: (body: {
      gameId?: number;
      bggId?: number;
      game?: Partial<BggGame> & { title: string };
    }) => nominate(slotId, body),
    // Deliberately not returned: closing the dialog shouldn't wait on the refetch.
    onSuccess: () => {
      void invalidate();
    },
    onSettled: () => setAddingId(null),
  });

  // The dialog stays open after a nomination so several games can be added in
  // one go; rows that landed are ticked off instead.
  const markAdded = (key: number) => ({
    onSuccess: () => setAdded((cur) => new Set(cur).add(key)),
  });

  /** Already in the library — nominate by id, no BoardGameGeek call at all. */
  function addFromLibrary(gameId: number) {
    setAddingId(gameId);
    nominateGame.mutate({ gameId }, markAdded(gameId));
  }

  /** New to us — the server fetches the details once and keeps them. */
  function addFromBgg(bggId: number) {
    setAddingId(bggId);
    nominateGame.mutate({ bggId }, markAdded(bggId));
  }

  function addManual() {
    const playtime = manual.playtimeMinutes ? Number(manual.playtimeMinutes) : null;
    nominateGame.mutate(
      {
        game: {
          title: manual.title.trim(),
          minPlayers: Number(manual.minPlayers) || 1,
          maxPlayers: Number(manual.maxPlayers) || 99,
          playtimeMinutes: playtime,
          length: manual.length,
        },
      },
      // Clear the form so another game can be entered, matching the
      // library/BGG lists which also stay open after adding.
      { onSuccess: () => setManual((m) => ({ ...m, title: "", playtimeMinutes: "" })) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed">
          <Plus /> Nominate a game
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nominate a game</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="bgg">
          <TabsList className="w-full">
            <TabsTrigger value="bgg">BoardGameGeek</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>

          <TabsContent value="bgg" className="flex flex-col gap-3 pt-2">
            <SearchInput
              autoFocus
              placeholder="Search your games, or BoardGameGeek…"
              value={query}
              onValueChange={setQuery}
            />

            {!search.isFetching && (search.data?.length ?? 0) > 0 && (
              <p className="text-muted-foreground px-2 text-xs">
                {search.data?.length} result{search.data?.length === 1 ? "" : "s"} — big
                families like Munchkin run long; add a year to narrow it (e.g. “Munchkin 2011”).
              </p>
            )}

            <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {libraryGames.length > 0 && (
                <>
                  <p className="text-muted-foreground flex items-center gap-1.5 px-2 pt-1 text-xs font-medium">
                    <Library className="size-3.5" />
                    {shortlisted ? "Games at this weekend" : "Your games"}
                  </p>
                  {libraryGames.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      disabled={addingId != null}
                      onClick={() => addFromLibrary(g.id)}
                      className="hover:bg-muted flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {g.thumbnailUrl && (
                          <img
                            src={g.thumbnailUrl}
                            alt=""
                            className="size-7 shrink-0 rounded object-cover"
                          />
                        )}
                        <span className="truncate">{g.title}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {g.minPlayers}–{g.maxPlayers}p
                        </Badge>
                      </span>
                      {addingId === g.id ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                      ) : added.has(g.id) ? (
                        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                          <Check className="size-3.5" /> Added
                        </span>
                      ) : (
                        <Plus className="text-muted-foreground size-4 shrink-0" />
                      )}
                    </button>
                  ))}
                </>
              )}

              {debouncedQuery.trim().length >= 2 && (
                <p className="text-muted-foreground px-2 pt-2 text-xs font-medium">
                  From BoardGameGeek
                </p>
              )}
              {search.isFetching && (
                <p className="text-muted-foreground flex items-center gap-2 p-2 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Searching…
                </p>
              )}
              {newToUs.map((r) => (
                <button
                  key={r.bggId}
                  type="button"
                  disabled={addingId != null}
                  onClick={() => addFromBgg(r.bggId)}
                  className="hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-50"
                >
                  <span>
                    {r.title}
                    {r.year && <span className="text-muted-foreground"> ({r.year})</span>}
                  </span>
                  {addingId === r.bggId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : added.has(r.bggId) ? (
                    <span className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Check className="size-3.5" /> Added
                    </span>
                  ) : (
                    <Plus className="text-muted-foreground size-4" />
                  )}
                </button>
              ))}
              {debouncedQuery.trim().length >= 2 &&
                newToUs.length === 0 &&
                !search.isFetching &&
                !search.isError && (
                  <p className="text-muted-foreground p-2 text-sm">Nothing new on BGG.</p>
                )}
              {libraryGames.length === 0 && shortlisted && (
                <p className="text-muted-foreground p-2 text-sm">
                  {q
                    ? "Nothing brought to this weekend matches."
                    : "No games have been marked as brought to this weekend."}
                </p>
              )}
              {libraryGames.length === 0 && !shortlisted && debouncedQuery.trim().length < 2 && (
                <p className="text-muted-foreground p-2 text-sm">
                  Type at least 2 characters to search BoardGameGeek.
                </p>
              )}
              {search.isError && (
                <p className="bg-destructive/10 text-destructive rounded-md p-2 text-sm">
                  {(search.error as Error).message}
                </p>
              )}
              {nominateGame.isError && (
                <p className="bg-destructive/10 text-destructive rounded-md p-2 text-sm">
                  {(nominateGame.error as Error).message}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="manual" className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="mg-title">Title</Label>
              <Input
                id="mg-title"
                value={manual.title}
                onChange={(e) => setManual({ ...manual, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="mg-min">Min players</Label>
                <Input
                  id="mg-min"
                  type="number"
                  min={1}
                  value={manual.minPlayers}
                  onChange={(e) => setManual({ ...manual, minPlayers: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mg-max">Max players</Label>
                <Input
                  id="mg-max"
                  type="number"
                  min={1}
                  value={manual.maxPlayers}
                  onChange={(e) => setManual({ ...manual, maxPlayers: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mg-time">Minutes</Label>
                <Input
                  id="mg-time"
                  type="number"
                  min={0}
                  placeholder="90"
                  value={manual.playtimeMinutes}
                  onChange={(e) => setManual({ ...manual, playtimeMinutes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label>Length:</Label>
              <div className="inline-flex overflow-hidden rounded-md border">
                {(["short", "long"] as const).map((len) => (
                  <button
                    key={len}
                    type="button"
                    onClick={() => setManual({ ...manual, length: len })}
                    className={
                      manual.length === len
                        ? "bg-primary text-primary-foreground px-3 py-1 text-xs font-medium"
                        : "hover:bg-muted px-3 py-1 text-xs font-medium"
                    }
                  >
                    {len}
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={addManual}
                disabled={!manual.title.trim() || nominateGame.isPending}
              >
                Nominate
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
