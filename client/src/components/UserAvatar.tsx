import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fullName } from "@/lib/names";
import { cn } from "@/lib/utils";

interface Props {
  user: { name: string | null; email: string; avatarUrl: string | null };
  className?: string;
  title?: string;
}

export function initials(user: { name: string | null; email: string }): string {
  const source = user.name ?? user.email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default function UserAvatar({ user, className, title }: Props) {
  return (
    // The hover title keeps the whole name: labels elsewhere are first names
    // only, and this is what tells two Simons apart.
    <Avatar className={cn("size-7", className)} title={title ?? fullName(user)}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} referrerPolicy="no-referrer" />}
      <AvatarFallback>{initials(user)}</AvatarFallback>
    </Avatar>
  );
}
