import { ArrowLeft, QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { MarkPresentList, RemoveExcusalButton } from "@/components/admin/mark-present-list";
import { ProcessAbsencesButton } from "@/components/admin/process-absences-button";
import { ResetQrButton } from "@/components/admin/reset-qr-button";
import { SessionStatus } from "@/components/admin/session-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionAttendance } from "@/lib/attendance";
import type { CheckinMethod } from "@/lib/checkin-types";
import { appTimeZone } from "@/lib/config";
import { requireAdmin } from "@/lib/dal";
import { zonedTime } from "@/lib/time";

export const metadata: Metadata = { title: "Session" };

const METHOD: Record<CheckinMethod, string> = {
  auto_geofence: "Location",
  qr_scan: "QR code",
  manual_admin: "Marked by a leader",
};

export default function SessionPage({ params }: PageProps<"/admin/sessions/[id]">) {
  return (
    <div className="space-y-8">
      <Link
        href="/admin/sessions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All sessions
      </Link>
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <SessionDetail params={params} />
      </Suspense>
    </div>
  );
}

async function SessionDetail({ params }: Pick<PageProps<"/admin/sessions/[id]">, "params">) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getSessionAttendance(id);
  if (!data) notFound();

  const { session, attended, excused, notCheckedIn } = data;
  const timeZone = appTimeZone();
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${session.serviceDate}T00:00:00Z`));
  const live = session.status !== "cancelled" && session.status !== "processed";

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2">
          <SessionStatus status={session.status} />
          <h1 className="text-4xl font-semibold sm:text-5xl">{day}</h1>
          <p className="tabular text-muted-foreground">
            Check-in {zonedTime(session.startsAt, timeZone)} to{" "}
            {zonedTime(session.endsAt, timeZone)}, within {session.radiusM} m
          </p>
        </div>
        {session.status === "closed" && <ProcessAbsencesButton sessionId={id} />}
        {live && (
          <div className="flex flex-wrap items-center gap-2">
            {(session.status === "scheduled" || session.status === "open") && (
              <ResetQrButton sessionId={id} />
            )}
            <Button asChild className="h-11 rounded-xl px-4">
              <Link href={`/admin/sessions/${id}/display`}>
                <QrCode aria-hidden />
                Show check-in code
              </Link>
            </Button>
          </div>
        )}
      </div>

      <dl className="grid max-w-2xl grid-cols-3 gap-4">
        {[
          ["Checked in", attended.length],
          ["Excused", excused.length],
          ["Not in yet", notCheckedIn.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border bg-card p-5 shadow-sm">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="tabular mt-2 font-heading text-4xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="space-y-3" aria-labelledby="not-in">
          <h2 id="not-in" className="text-xl font-semibold">
            Not checked in
          </h2>
          {!live && (
            <p className="text-sm text-muted-foreground">
              This session is {session.status}, so attendance can no longer change here.
            </p>
          )}
          <MarkPresentList
            sessionId={id}
            canMark={live}
            members={notCheckedIn.map(({ userId, name, email }) => ({ userId, name, email }))}
          />
        </section>

        <section className="space-y-3" aria-labelledby="checked-in">
          <h2 id="checked-in" className="text-xl font-semibold">
            Checked in
          </h2>
          {attended.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-5 py-6 text-center text-muted-foreground">
              No one yet.
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
              {attended.map((row) => (
                <li key={row.userId} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="text-sm text-muted-foreground">{METHOD[row.method]}</p>
                  </div>
                  <span className="tabular text-sm text-muted-foreground">
                    {zonedTime(row.checkedInAt, timeZone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {excused.length > 0 && (
            <>
              <h3 className="pt-4 text-lg font-semibold">Excused</h3>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
                {excused.map((row) => (
                  <li
                    key={row.userId}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{row.name}</p>
                      {row.reason && <p className="text-sm text-muted-foreground">{row.reason}</p>}
                    </div>
                    {live && (
                      <RemoveExcusalButton sessionId={id} userId={row.userId} name={row.name} />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
