import { QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/admin/auto-refresh";
import { SessionStatus } from "@/components/admin/session-status";
import { TrendChart } from "@/components/admin/trend-chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { appTimeZone } from "@/lib/config";
import { requireAdmin } from "@/lib/dal";
import { listOpenFollowUps } from "@/lib/follow-ups";
import { firstName } from "@/lib/greeting";
import { getAttendanceTrend, getMemberCounts, getThisSunday } from "@/lib/stats";
import { zonedTime } from "@/lib/time";

export const metadata: Metadata = { title: "Admin" };

const dayName = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

export default function AdminPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const admin = await requireAdmin();
  const [followUps, sunday, trend, counts] = await Promise.all([
    listOpenFollowUps(5),
    getThisSunday(),
    getAttendanceTrend(12),
    getMemberCounts(),
  ]);
  const timeZone = appTimeZone();

  return (
    <div className="space-y-12">
      {sunday?.status === "open" && <AutoRefresh seconds={30} />}
      <h1 className="text-4xl font-semibold sm:text-5xl">Welcome back, {firstName(admin.name)}</h1>

      {/* Follow-ups first: the people who most need someone to reach out. */}
      <section className="space-y-4" aria-labelledby="follow-ups">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="follow-ups" className="text-2xl font-semibold">
            Needs a follow-up{" "}
            <span className="tabular text-muted-foreground">({counts.flagged})</span>
          </h2>
          <Link
            href="/admin/follow-ups"
            className="text-sm font-medium text-primary hover:underline"
          >
            All follow-ups
          </Link>
        </div>
        {followUps.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-5 py-6 text-center text-muted-foreground">
            No one needs a follow-up right now.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {followUps.map((f) => (
              <li key={f.id}>
                <Link
                  href="/admin/follow-ups"
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-muted/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{f.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {f.assignedTo ? `With ${f.assignedTo.name}` : "Not assigned yet"}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm">
                    <span className="font-semibold">{f.streak}</span>{" "}
                    <span className="text-muted-foreground">missed</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[22rem_1fr]">
        <section
          className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm"
          aria-labelledby="sunday"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="sunday" className="text-lg font-semibold">
              {sunday ? dayName(sunday.serviceDate) : "This Sunday"}
            </h2>
            {sunday && <SessionStatus status={sunday.status} />}
          </div>
          {sunday ? (
            <>
              <p className="tabular">
                <span className="font-heading text-6xl font-semibold">{sunday.attended}</span>{" "}
                <span className="text-muted-foreground">of {sunday.expected} checked in</span>
              </p>
              <p className="tabular text-sm text-muted-foreground">
                Check-in {zonedTime(sunday.startsAt, timeZone)} to{" "}
                {zonedTime(sunday.endsAt, timeZone)}
                {sunday.excused > 0 ? `, ${sunday.excused} excused` : ""}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/sessions/${sunday.id}`}>Open session</Link>
                </Button>
                {(sunday.status === "open" || sunday.status === "scheduled") && (
                  <Button asChild size="sm">
                    <Link href={`/admin/sessions/${sunday.id}/display`}>
                      <QrCode aria-hidden />
                      Show code
                    </Link>
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              No session yet.{" "}
              <Link href="/admin/sessions" className="font-medium text-primary hover:underline">
                Create one
              </Link>
              .
            </p>
          )}
        </section>

        <section
          className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm"
          aria-labelledby="trend"
        >
          <h2 id="trend" className="text-lg font-semibold">
            Attendance, last {trend.length || 12} Sundays
          </h2>
          <TrendChart points={trend} />
        </section>
      </div>

      <p className="tabular text-sm text-muted-foreground">
        {counts.members} active members.{" "}
        <Link href="/admin/members" className="font-medium text-primary hover:underline">
          Manage members
        </Link>
      </p>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-10" aria-busy>
      <Skeleton className="h-12 w-2/3 max-w-md" />
      <Skeleton className="h-48 rounded-2xl" />
      <div className="grid gap-8 lg:grid-cols-[22rem_1fr]">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}
