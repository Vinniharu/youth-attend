import "server-only";

import { and, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";

import { getDb } from "@/db/client";
import { attendanceLogs, serviceSessions } from "@/db/schema";
import { appTimeZone, defaultServiceWindow, locationRetentionDays } from "@/lib/config";
import { createSession, SessionError } from "@/lib/sessions";
import { upcomingSunday } from "@/lib/time";

// Scheduled jobs (scripts/scheduler.mjs calls them through /api/cron/*). Every job
// is idempotent, so a missed or repeated run is harmless.

/** Sunday 06:00: create today's session (or the next Sunday's) if it doesn't exist. */
export async function createUpcomingSession(now = new Date()) {
  const serviceDate = upcomingSunday(appTimeZone(), now);
  try {
    const session = await createSession({ serviceDate, ...defaultServiceWindow() }, appTimeZone());
    return { serviceDate, created: true, sessionId: session.id };
  } catch (error) {
    if (error instanceof SessionError) return { serviceDate, created: false, reason: error.code };
    throw error;
  }
}

/**
 * Every 5 minutes: open scheduled sessions whose window has started, and close any
 * session (open or still scheduled) whose window has ended, so the absence engine
 * can process it. A session an admin closed early is never reopened.
 */
export async function openAndCloseSessions(now = new Date()) {
  const db = getDb();
  const opened = await db
    .update(serviceSessions)
    .set({ status: "open" })
    .where(
      and(
        eq(serviceSessions.status, "scheduled"),
        lte(serviceSessions.startsAt, now),
        gt(serviceSessions.endsAt, now),
      ),
    )
    .returning({ id: serviceSessions.id });
  const closed = await db
    .update(serviceSessions)
    .set({ status: "closed" })
    .where(
      and(inArray(serviceSessions.status, ["scheduled", "open"]), lte(serviceSessions.endsAt, now)),
    )
    .returning({ id: serviceSessions.id });
  return { opened: opened.length, closed: closed.length };
}

/** Daily 03:00: wipe check-in coordinates older than LOCATION_RETENTION_DAYS. */
export async function purgeOldLocations(now = new Date()) {
  const cutoff = new Date(now.getTime() - locationRetentionDays() * 86_400_000);
  const purged = await getDb()
    .update(attendanceLogs)
    .set({ location: null, accuracyM: null })
    .where(and(isNotNull(attendanceLogs.location), lte(attendanceLogs.checkedInAt, cutoff)))
    .returning({ id: attendanceLogs.id });
  return { purged: purged.length, olderThan: cutoff.toISOString() };
}
