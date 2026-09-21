import { useSearchParams } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { startGoogleLogin } from "@/lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "That Google account isn't on the guest list for this weekend.",
  oauth_failed: "Google sign-in failed. Please try again.",
  invalid_request: "Something went wrong with the sign-in request. Please try again.",
};

export default function LoginPage() {
  const [params] = useSearchParams();
  const error = params.get("error");

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="bg-primary text-primary-foreground mb-2 grid size-12 place-items-center rounded-xl">
            <CalendarDays className="size-6" />
          </div>
          <CardTitle className="text-xl">Last Box Standing</CardTitle>
          <CardDescription>Sign in to view and build the schedule.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
              {ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again."}
            </p>
          )}
          <Button className="w-full" onClick={startGoogleLogin}>
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
