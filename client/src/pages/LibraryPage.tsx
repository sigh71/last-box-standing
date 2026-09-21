import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Package, Plus, Trash2, Users as UsersIcon } from "lucide-react";
import SearchInput from "@/components/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AddGameToLibraryDialog from "@/components/AddGameToLibraryDialog";
import {
  createCopy,
  deleteCopy,
  listUsers,
  searchLibrary,
  setCopyExpansion,
  updateCopy,
  type Attendee,
  type Copy,
  type Game,
} from "@/lib/api";
import { firstName } from "@/lib/names";
import { cn } from "@/lib/utils";

const NOBODY = "none";
const GROUP = "group";

function personName(people: Attendee[], id: number | null): string | null {
  if (id == null) return null;
  const p = people.find((x) => x.id === id);
  return p ? firstName(p) : null;
}

export default function LibraryPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);

  const { data: allGames, isLoading } = useQuery({
    queryKey: ["library", "all"],
    queryFn: () => searchLibrary("", "all"),
  });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: listUsers });

  const people: Attendee[] = (users ?? [])
    .filter((u) => u.deactivatedAt === null)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["library"] });
  const addCopy = useMutation({ mutationFn: createCopy, onSuccess: invalidate });
  const removeCopy = useMutation({ mutationFn: deleteCopy, onSuccess: invalidate });
  const saveCopy = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateCopy>[1] }) =>
      updateCopy(id, body),
    onSuccess: invalidate,
  });
  const toggleExpansion = useMutation({
    mutationFn: ({
      copyId,
      expansionGameId,
      included,
    }: {
      copyId: number;
      expansionGameId: number;
      included: boolean;
    }) => setCopyExpansion(copyId, expansionGameId, included),
    onSuccess: invalidate,
  });

  const games = allGames ?? [];
  const q = query.trim().toLowerCase();
  /**
   * "Owned" means somebody has recorded a physical copy — the library also
   * holds every game anyone has ever nominated, which is what makes the filter
   * worth having. A copy whose owner is still "Nobody" counts: the group has
   * the box, it just hasn't been said whose it is.
   */
  const owned = (g: Game) => (g.copies?.length ?? 0) > 0;
  const matchesQuery = (g: Game) => !q || g.title.toLowerCase().includes(q);
  const matches = (g: Game) => matchesQuery(g) && (!ownedOnly || owned(g));

  const isExpansion = (g: Game) => g.bggType === "boardgameexpansion";
  const isOrphan = (g: Game) =>
    isExpansion(g) && (g.baseGameId == null || !games.some((b) => b.id === g.baseGameId));

  const bases = games.filter((g) => !isExpansion(g)).filter(matches);
  const expansionsOf = (baseId: number) =>
    games.filter((g) => isExpansion(g) && g.baseGameId === baseId);
  const orphanExpansions = games.filter(isOrphan).filter(matches);

  // Counted over the rows the page actually lists — expansions shown inside
  // their base game's block aren't rows of their own, so counting every game
  // would promise to hide more than the eye can see.
  const listed = games.filter((g) => !isExpansion(g) || isOrphan(g)).filter(matchesQuery);
  const ownedCount = listed.filter(owned).length;
  const hiddenByFilter = listed.length - ownedCount;

  function CopyRow({ copy, game }: { copy: Copy; game: Game }) {
    const available = expansionsOf(game.id);
    const ownerValue =
      copy.ownerKind === "group"
        ? GROUP
        : copy.ownerKind === "member" && copy.ownerUserId != null
          ? String(copy.ownerUserId)
          : NOBODY;
    // Only worth calling out when the expansions actually change the seating.
    const widened = copy.minPlayers !== game.minPlayers || copy.maxPlayers !== game.maxPlayers;

    return (
      <div className="bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md p-2">
        {/* Stacked on a phone — two 144px selects don't fit side by side. */}
        <label className="flex w-full items-center justify-between gap-1.5 text-xs sm:w-auto sm:justify-start">
          <span className="text-muted-foreground">Owner</span>
          <Select
            value={ownerValue}
            onValueChange={(v) =>
              saveCopy.mutate({
                id: copy.id,
                body:
                  v === GROUP
                    ? { ownerKind: "group", ownerUserId: null }
                    : v === NOBODY
                      ? { ownerKind: null, ownerUserId: null }
                      : { ownerKind: "member", ownerUserId: Number(v) },
              })
            }
          >
            <SelectTrigger className="h-9 w-44 text-xs sm:h-8 sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>Nobody</SelectItem>
              <SelectItem value={GROUP}>The group</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {firstName(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex w-full items-center justify-between gap-1.5 text-xs sm:w-auto sm:justify-start">
          <span className="text-muted-foreground">Has it</span>
          <Select
            value={copy.holderUserId != null ? String(copy.holderUserId) : NOBODY}
            onValueChange={(v) =>
              saveCopy.mutate({
                id: copy.id,
                body: { holderUserId: v === NOBODY ? null : Number(v) },
              })
            }
          >
            <SelectTrigger className="h-9 w-44 text-xs sm:h-8 sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>Unknown</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {firstName(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <span
          className={cn(
            "flex items-center gap-1 text-xs",
            widened ? "text-foreground font-medium" : "text-muted-foreground",
          )}
          title={widened ? "Expansions change how many this box seats" : undefined}
        >
          <UsersIcon className="size-3" />
          {copy.minPlayers}–{copy.maxPlayers}
        </span>

        {available.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">In the box:</span>
            {available.map((e) => {
              const included = copy.expansionGameIds.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() =>
                    toggleExpansion.mutate({
                      copyId: copy.id,
                      expansionGameId: e.id,
                      included: !included,
                    })
                  }
                  className={cn(
                    // Roomier on a phone so it's actually tappable.
                    "rounded-full border px-3 py-1.5 text-xs transition-colors sm:px-2 sm:py-0.5",
                    included
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-background text-muted-foreground",
                  )}
                >
                  {e.title.replace(`${game.title}: `, "")}
                </button>
              );
            })}
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-9 sm:size-7"
          title="Remove this copy"
          onClick={() => removeCopy.mutate(copy.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    );
  }

  function GameBlock({ game }: { game: Game }) {
    const copies = game.copies ?? [];
    const owners = copies
      .map((c) =>
        c.ownerKind === "group" ? "the group" : personName(people, c.ownerUserId),
      )
      .filter(Boolean);

    return (
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            {game.thumbnailUrl ? (
              <img
                src={game.thumbnailUrl}
                alt=""
                className="size-10 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="bg-muted grid size-10 shrink-0 place-items-center rounded">
                <Package className="text-muted-foreground size-4" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {game.title}
                {game.yearPublished ? (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    ({game.yearPublished})
                  </span>
                ) : null}
              </p>
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <UsersIcon className="size-3" />
                  {game.minPlayers}–{game.maxPlayers}
                </span>
                {game.playtimeMinutes != null && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {game.playtimeMinutes}m
                  </span>
                )}
                {copies.length > 0 && (
                  <Badge variant="secondary">
                    {copies.length} {copies.length === 1 ? "copy" : "copies"}
                    {owners.length > 0 && ` · ${owners.join(", ")}`}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addCopy.mutate(game.id)}
            disabled={addCopy.isPending}
          >
            <Plus /> Add a copy
          </Button>
        </div>

        {copies.length === 0 ? (
          <p className="text-muted-foreground/70 text-xs">
            Nobody has recorded a copy of this yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {copies.map((c) => (
              <CopyRow key={c.id} copy={c} game={game} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Game library</h1>
          <p className="text-muted-foreground text-sm">
            Every game the group can play. A game can have several copies — each with its own
            owner, whoever currently has it, and its own expansions.
          </p>
        </div>
        <AddGameToLibraryDialog />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="max-w-sm flex-1"
          placeholder="Filter games…"
          value={query}
          onValueChange={setQuery}
        />
        <button
          type="button"
          role="switch"
          aria-checked={ownedOnly}
          onClick={() => setOwnedOnly((v) => !v)}
          title={
            ownedOnly
              ? "Showing only games someone has a copy of"
              : hiddenByFilter === 0
                ? "Every game listed already has a copy"
                : `Hide the ${hiddenByFilter} game${hiddenByFilter === 1 ? "" : "s"} nobody has a copy of`
          }
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors sm:py-1.5",
            ownedOnly
              ? "border-primary bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground",
          )}
        >
          <Package className="size-4" />
          We own it
          <span className="tabular-nums opacity-70">{ownedCount}</span>
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : bases.length === 0 && orphanExpansions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {ownedOnly
                ? "No games with a copy"
                : q
                  ? "No games match"
                  : "No games yet"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {ownedOnly
              ? "Nothing matching has a copy recorded — turn the filter off to see the rest."
              : q
                ? "Try a different search."
                : "Add games here, or they'll appear automatically as people nominate them."}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {bases.map((game) => (
            <GameBlock key={game.id} game={game} />
          ))}

          {orphanExpansions.length > 0 && (
            <>
              <h2 className="text-muted-foreground mt-2 text-sm font-medium">
                Expansions whose base game isn't in the library
              </h2>
              {orphanExpansions.map((e) => (
                <div key={e.id} className="rounded-md border border-dashed p-3 text-sm">
                  {e.title} <Badge variant="outline">Expansion</Badge>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
