import type { Metadata } from "next";
import { Suspense } from "react";

import { FollowUpCard } from "@/components/admin/follow-up-card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/dal";
import { listLeaders, listOpenFollowUps, listResolvedFollowUps } from "@/lib/follow-ups";

export const metadata: Metadata = { title: "Follow-ups" };

export default function FollowUpsPage() {
  return (
    <div className="space-y-8">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-4xl font-semibold sm:text-5xl">Follow-ups</h1>
        <p className="text-muted-foreground">
          Members who missed several Sundays in a row. Reach out, note what happened, and resolve it
          once someone has spoken with them.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
        <FollowUps />
      </Suspense>
    </div>
  );
}

async function FollowUps() {
  await requireAdmin();
  const [open, resolved, leaders] = await Promise.all([
    listOpenFollowUps(),
    listResolvedFollowUps(),
    listLeaders(),
  ]);

  return (
    <div className="space-y-12">
      <section className="space-y-4" aria-labelledby="open">
        <h2 id="open" className="text-xl font-semibold">
          Open <span className="tabular text-muted-foreground">({open.length})</span>
        </h2>
        {open.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-5 py-8 text-center text-muted-foreground">
            No one needs a follow-up right now.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {open.map((f) => (
              <FollowUpCard
                key={f.id}
                leaders={leaders}
                followUp={{
                  id: f.id,
                  name: f.name,
                  email: f.email,
                  phone: f.phone,
                  streak: f.streak,
                  streakAtOpen: f.streakAtOpen,
                  openedAt: f.openedAt.toISOString(),
                  lastAttended: f.lastAttended,
                  notes: f.notes,
                  assignedToId: f.assignedTo?.id ?? null,
                }}
              />
            ))}
          </div>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="space-y-4" aria-labelledby="resolved">
          <h2 id="resolved" className="text-xl font-semibold">
            Recently resolved
          </h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {resolved.map((f) => (
              <li key={f.id} className="space-y-1 px-5 py-3">
                <p className="font-medium">{f.name}</p>
                <p className="text-sm text-muted-foreground">
                  Resolved{f.resolvedBy ? ` by ${f.resolvedBy}` : ""}
                  {f.notes ? `: ${f.notes}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
