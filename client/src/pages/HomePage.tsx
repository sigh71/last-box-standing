import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createEvent, listEvents } from "@/lib/api";

/** Next Friday (or today if it is Friday) plus the following Monday. */
function defaultDates(): { start: string; end: string } {
  const now = new Date();
  const friday = new Date(now);
  friday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7));
  const monday = new Date(friday);
  monday.setDate(friday.getDate() + 3);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(friday), end: iso(monday) };
}

function fmtRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = new Date(`${start}T00:00:00`).toLocaleDateString(undefined, opts);
  const e = new Date(`${end}T00:00:00`).toLocaleDateString(undefined, {
    ...opts,
    year: "numeric",
  });
  return `${s} – ${e}`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useQuery({ queryKey: ["events"], queryFn: listEvents });

  const defaults = defaultDates();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);

  const create = useMutation({
    mutationFn: () => createEvent({ name, startDate, endDate }),
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      setOpen(false);
      navigate(`/events/${event.id}`);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Weekends</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> New weekend
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New weekend</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ev-name">Name</Label>
                <Input
                  id="ev-name"
                  placeholder="Summer 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ev-start">First day</Label>
                  <Input
                    id="ev-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ev-end">Last day</Label>
                  <Input
                    id="ev-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              {create.isError && (
                <p className="text-destructive text-sm">{(create.error as Error).message}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => create.mutate()}
                disabled={!name.trim() || create.isPending}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : events && events.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <Link key={e.id} to={`/events/${e.id}`}>
              <Card className="hover:border-ring/50 h-full transition-colors">
                <CardHeader>
                  <CardTitle>{e.name}</CardTitle>
                  <CardDescription className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="size-3.5" />
                      {fmtRange(e.startDate, e.endDate)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="size-3.5" />
                      {e.attendeeCount} attending
                    </span>
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No weekends yet</CardTitle>
            <CardDescription>
              Create the first one — it'll get Fri–Mon days with Morning/Afternoon/Evening
              slots, ready for games.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
