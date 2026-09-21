import { Link, NavLink, Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Dices, Library, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";
import { logout, type Me } from "@/lib/api";
import { firstName } from "@/lib/names";

export default function Layout({ user }: { user: Me }) {
  const queryClient = useQueryClient();

  async function handleLogout() {
    await logout();
    queryClient.setQueryData(["me"], null);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Dices className="size-5" />
            Last Box Standing
          </Link>
          <div className="flex items-center gap-3">
            <NavLink
              to="/library"
              className={({ isActive }) =>
                `text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm ${
                  isActive ? "text-foreground font-medium" : ""
                }`
              }
            >
              <Library className="size-4" />
              <span className="hidden sm:inline">Library</span>
            </NavLink>
            {user.isAdmin && (
              <NavLink
                to="/users"
                className={({ isActive }) =>
                  `text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm ${
                    isActive ? "text-foreground font-medium" : ""
                  }`
                }
              >
                <Users className="size-4" />
                <span className="hidden sm:inline">Users</span>
              </NavLink>
            )}
            <UserAvatar user={user} />
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {firstName(user)}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
