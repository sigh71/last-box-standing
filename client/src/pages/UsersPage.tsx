import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Trash2, UserPlus, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import UserAvatar from "@/components/UserAvatar";
import { addUser, listUsers, removeUser, type AppUser } from "@/lib/api";
import { cn } from "@/lib/utils";

function UserRow({
  user,
  onRemove,
  onRestore,
  busy,
}: {
  user: AppUser;
  onRemove: () => void;
  onRestore: () => void;
  busy: boolean;
}) {
  const removed = user.deactivatedAt !== null;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border p-3",
        removed && "opacity-60",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar user={user} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
          {user.name && (
            <p className="text-muted-foreground truncate text-xs">{user.email}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {user.isAdmin && (
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck /> Admin
          </Badge>
        )}
        {removed ? (
          <Badge variant="outline">Removed</Badge>
        ) : (
          !user.signedIn && <Badge variant="outline">Not signed in yet</Badge>
        )}
        {removed ? (
          <Button variant="ghost" size="icon" title="Restore access" disabled={busy} onClick={onRestore}>
            <Undo2 className="size-4" />
          </Button>
        ) : (
          !user.isAdmin && (
            <Button variant="ghost" size="icon" title="Remove access" disabled={busy} onClick={onRemove}>
              <Trash2 className="size-4" />
            </Button>
          )
        )}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: listUsers });

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    return queryClient.invalidateQueries({ queryKey: ["users"] });
  };
  const onError = (e: unknown) => setError((e as Error).message);

  const add = useMutation({
    mutationFn: () => addUser({ email, name: name.trim() || undefined }),
    onSuccess: async () => {
      setEmail("");
      setName("");
      await invalidate();
    },
    onError,
  });

  const remove = useMutation({ mutationFn: removeUser, onSuccess: invalidate, onError });
  // Re-adding a removed email is what restores it, server-side.
  const restore = useMutation({
    mutationFn: (u: AppUser) => addUser({ email: u.email }),
    onSuccess: invalidate,
    onError,
  });

  const active = users?.filter((u) => u.deactivatedAt === null) ?? [];
  const removed = users?.filter((u) => u.deactivatedAt !== null) ?? [];
  const busy = add.isPending || remove.isPending || restore.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-muted-foreground text-sm">
          Add someone by their Google email and they can sign in — no invitation needed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a user</CardTitle>
          <CardDescription>
            Use the email on their Google account. A display name is optional — theirs is
            picked up when they first sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) add.mutate();
            }}
          >
            <div className="flex min-w-56 flex-1 flex-col gap-2">
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                placeholder="friend@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex min-w-40 flex-col gap-2">
              <Label htmlFor="u-name">Name (optional)</Label>
              <Input
                id="u-name"
                placeholder="Dave"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={!email.trim() || busy}>
              {add.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Add user
            </Button>
          </form>
          {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              busy={busy}
              onRemove={() => remove.mutate(u.id)}
              onRestore={() => restore.mutate(u)}
            />
          ))}

          {removed.length > 0 && (
            <>
              <h2 className="text-muted-foreground mt-2 text-sm font-medium">Removed</h2>
              {removed.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  busy={busy}
                  onRemove={() => remove.mutate(u.id)}
                  onRestore={() => restore.mutate(u)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
