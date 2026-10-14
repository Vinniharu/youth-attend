import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CreateSessionForm } from "@/components/admin/create-session-form";
import { SessionList } from "@/components/admin/session-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { appTimeZone, defaultServiceWindow } from "@/lib/config";
import { requireAdmin } from "@/lib/dal";
import { getDefaultLocation } from "@/lib/location";
import { listSessions } from "@/lib/sessions";
import { addDays, upcomingSunday, zonedDate } from "@/lib/time";

export const metadata: Metadata = { title: "Sessions" };

export default function SessionsPage() {
  return (
    <div className="space-y-8">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-4xl font-semibold sm:text-5xl">Sessions</h1>
        <p className="text-muted-foreground">
          One session per service. Check-in is only accepted inside its window, at the location it
          was created with.
        </p>
      </div>
      <Suspense fallback={<SessionsSkeleton />}>
        <Sessions />
      </Suspense>
    </div>
  );
}

function SessionsSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]" aria-busy>
      <div className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

async function Sessions() {
  await requireAdmin();
  const timeZone = appTimeZone();
  const today = zonedDate(new Date(), timeZone);
  const [{ upcoming, past }, location] = await Promise.all([
    listSessions(today),
    getDefaultLocation(),
  ]);

  // Suggest the first Sunday that doesn't have a session yet (all upcoming are loaded).
  const taken = new Set(upcoming.map((s) => s.serviceDate));
  let suggested = upcomingSunday(timeZone);
  while (taken.has(suggested)) suggested = addDays(suggested, 7);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="space-y-10">
        <SessionList
          title="Upcoming"
          sessions={upcoming}
          timeZone={timeZone}
          empty="No upcoming sessions. Create this Sunday's from the form."
        />
        <SessionList
          title="Past"
          sessions={past}
          timeZone={timeZone}
          empty="Past sessions will appear here."
        />
      </div>

      <aside className="order-first lg:sticky lg:top-6 lg:order-none">
        {location ? (
          <CreateSessionForm
            // Remount after each create so the form moves on to the next free Sunday.
            key={suggested}
            defaultDate={suggested}
            defaultStart={defaultServiceWindow().start}
            defaultEnd={defaultServiceWindow().end}
          />
        ) : (
          <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <MapPin className="size-6 text-primary" aria-hidden />
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Set the church location first</h2>
              <p className="text-sm text-muted-foreground">
                Every session copies the geofence, so it needs one before you can create sessions.
              </p>
            </div>
            <Button asChild className="h-11 w-full rounded-xl">
              <Link href="/admin/geofence">Set location</Link>
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
