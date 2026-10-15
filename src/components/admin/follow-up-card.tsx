"use client";

import { Mail, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { sendJson } from "@/lib/api-client";

export type FollowUpView = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  streak: number;
  streakAtOpen: number;
  openedAt: string;
  lastAttended: string | null;
  notes: string | null;
  assignedToId: string | null;
};

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso),
  );

type Props = { followUp: FollowUpView; leaders: { id: string; name: string }[] };

/** One open follow-up: who, how long, contact, notes, who's on it, resolve. */
export function FollowUpCard({ followUp, leaders }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(followUp.notes ?? "");
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [pending, startTransition] = useTransition();
  const notesChanged = notes.trim() !== (followUp.notes ?? "").trim();

  const save = (change: Record<string, unknown>, done: string) =>
    startTransition(async () => {
      const problem = await sendJson("/api/admin/follow-ups", "PATCH", {
        id: followUp.id,
        ...change,
      });
      if (problem) {
        toast.error(problem);
        return;
      }
      toast.success(done);
      router.refresh();
    });

  const returned = followUp.streak === 0;

  return (
    <article className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-semibold">{followUp.name}</h3>
          <p className="tabular text-sm text-muted-foreground">
            {returned ? (
              <>Came back after missing {followUp.streakAtOpen} Sundays</>
            ) : (
              <>
                <span className="font-medium text-foreground">{followUp.streak}</span> Sundays
                missed in a row
              </>
            )}
            {followUp.lastAttended ? `, last here ${day(followUp.lastAttended)}` : ", not yet seen"}
          </p>
        </div>
        <p className="tabular text-sm text-muted-foreground">Opened {day(followUp.openedAt)}</p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {followUp.phone && (
          <a
            href={`tel:${followUp.phone.replace(/[^\d+]/g, "")}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 font-medium text-secondary-foreground"
          >
            <Phone className="size-4" aria-hidden />
            {followUp.phone}
          </a>
        )}
        <a
          href={`mailto:${followUp.email}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 font-medium text-secondary-foreground"
        >
          <Mail className="size-4" aria-hidden />
          Email
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <div className="space-y-2">
          <Label htmlFor={`notes-${followUp.id}`}>Notes</Label>
          <textarea
            id={`notes-${followUp.id}`}
            value={notes}
            maxLength={2000}
            rows={3}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Who reached out, what they said, what's next."
            className="w-full rounded-xl border border-input bg-transparent px-3.5 py-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          />
          {notesChanged && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => save({ notes: notes.trim() || null }, "Notes saved.")}
            >
              Save notes
            </Button>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`assign-${followUp.id}`}>Leader</Label>
          <select
            id={`assign-${followUp.id}`}
            value={followUp.assignedToId ?? ""}
            disabled={pending}
            onChange={(event) =>
              save(
                { assignedTo: event.target.value || null },
                event.target.value ? "Leader assigned." : "Unassigned.",
              )
            }
            className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Not assigned</option>
            {leaders.map((leader) => (
              <option key={leader.id} value={leader.id}>
                {leader.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {confirmResolve ? (
          <>
            <p className="text-sm">Mark as resolved? Someone has reached out to them.</p>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => save({ resolve: true }, `${followUp.name}'s follow-up is resolved.`)}
            >
              Resolve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmResolve(false)}>
              Not yet
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirmResolve(true)}>
            Mark resolved
          </Button>
        )}
      </div>
    </article>
  );
}
