import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { requireAdmin } from "@/lib/dal";
import { firstName } from "@/lib/greeting";
import { getMemberCounts } from "@/lib/stats";

export const metadata: Metadata = { title: "Admin" };

// Phase 8 turns this into the full dashboard (follow-ups first, live count, trend).

export default function AdminPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const admin = await requireAdmin();
  const { members, flagged } = await getMemberCounts();

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold sm:text-5xl">
          Welcome back, {firstName(admin.name)}
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Geofence, Sunday sessions and the follow-up list will live here.
        </p>
      </div>

      <dl className="grid max-w-xl grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <dt className="text-sm text-muted-foreground">Active members</dt>
          <dd className="tabular mt-2 font-heading text-4xl font-semibold">{members}</dd>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            {flagged > 0 && <StatusDot tone="warning" pulsing={false} />}
            Need a follow-up
          </dt>
          <dd className="tabular mt-2 font-heading text-4xl font-semibold">{flagged}</dd>
        </div>
      </dl>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-10" aria-busy>
      <div className="space-y-3">
        <Skeleton className="h-12 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid max-w-xl grid-cols-2 gap-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    </div>
  );
}
