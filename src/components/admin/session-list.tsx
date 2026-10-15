"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SessionStatus } from "@/components/admin/session-status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendJson } from "@/lib/api-client";
import { updateSessionInput, type UpdateSessionInput } from "@/lib/schemas";
import type { SessionSummary } from "@/lib/sessions";
import { zonedTime } from "@/lib/time";

const formatDate = (serviceDate: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${serviceDate}T00:00:00Z`));

type Props = { title: string; sessions: SessionSummary[]; timeZone: string; empty: string };

export function SessionList({ title, sessions, timeZone, empty }: Props) {
  const router = useRouter();
  const [managing, setManaging] = useState<SessionSummary | null>(null);
  const [restoring, startRestoring] = useTransition();

  const restore = (session: SessionSummary) =>
    startRestoring(async () => {
      const problem = await sendJson(`/api/admin/sessions/${session.id}`, "PATCH", {
        status: "scheduled",
      });
      if (problem) {
        toast.error(problem);
        return;
      }
      toast.success("Session restored.");
      router.refresh();
    });

  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-xl font-semibold">{title}</h2>
      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-5 py-8 text-center text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <div className="min-w-40 flex-1">
                <Link
                  href={`/admin/sessions/${session.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {formatDate(session.serviceDate)}
                </Link>
                <p className="tabular text-sm text-muted-foreground">
                  {zonedTime(session.startsAt, timeZone)} to {zonedTime(session.endsAt, timeZone)}
                </p>
              </div>
              <p className="tabular text-sm text-muted-foreground sm:w-52">
                <span className="font-medium text-foreground">{session.attended}</span> checked in
                {session.excused > 0 && (
                  <>
                    , <span className="font-medium text-foreground">{session.excused}</span> excused
                  </>
                )}
              </p>
              <div className="flex w-full items-center justify-between gap-3 sm:w-44 sm:justify-end">
                <SessionStatus status={session.status} />
                {session.status === "cancelled" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoring}
                    onClick={() => restore(session)}
                  >
                    Restore
                  </Button>
                ) : session.status !== "processed" ? (
                  <Button variant="outline" size="sm" onClick={() => setManaging(session)}>
                    Manage
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {managing && (
        <ManageSessionDialog
          session={managing}
          timeZone={timeZone}
          onClose={() => setManaging(null)}
        />
      )}
    </section>
  );
}

type ManageProps = { session: SessionSummary; timeZone: string; onClose: () => void };

function ManageSessionDialog({ session, timeZone, onClose }: ManageProps) {
  const router = useRouter();
  const [times, setTimes] = useState({
    start: zonedTime(session.startsAt, timeZone),
    end: zonedTime(session.endsAt, timeZone),
  });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = (change: UpdateSessionInput, done: string) =>
    startTransition(async () => {
      setError(null);
      const parsed = updateSessionInput.safeParse(change);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the times.");
        return;
      }
      const problem = await sendJson(`/api/admin/sessions/${session.id}`, "PATCH", parsed.data);
      if (problem) {
        setError(problem);
        return;
      }
      toast.success(done);
      onClose();
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{formatDate(session.serviceDate)}</DialogTitle>
          <DialogDescription>
            Change when check-in is open, or open and close it by hand.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ window: times }, "Times updated.");
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-start">Check-in opens</Label>
              <Input
                id="edit-start"
                type="time"
                required
                value={times.start}
                onChange={(e) => setTimes((t) => ({ ...t, start: e.target.value }))}
                className="tabular h-11 rounded-xl px-3.5 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-end">Closes</Label>
              <Input
                id="edit-end"
                type="time"
                required
                value={times.end}
                onChange={(e) => setTimes((t) => ({ ...t, end: e.target.value }))}
                className="tabular h-11 rounded-xl px-3.5 text-base"
              />
            </div>
          </div>
          <Button type="submit" variant="secondary" disabled={pending} className="w-full">
            Save times
          </Button>
        </form>

        <div className="space-y-2 border-t pt-4">
          {session.status === "open" ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => apply({ status: "closed" }, "Check-in is closed.")}
            >
              Close check-in
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => apply({ status: "open" }, "Check-in is open.")}
            >
              {session.status === "closed" ? "Reopen check-in" : "Open check-in now"}
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            Members can only check in between the opening and closing times, even while the session
            is open.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <DialogFooter className="border-t pt-4 sm:justify-start">
          {confirmCancel ? (
            <div className="w-full space-y-3">
              <p className="text-sm">
                Cancel this Sunday? Check-in stays closed and nobody is marked absent. You can
                restore it later.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => apply({ status: "cancelled" }, "Session cancelled.")}
                >
                  Cancel session
                </Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmCancel(true)}
            >
              Cancel this session
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
