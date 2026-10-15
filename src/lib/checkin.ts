import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { attendanceLogs } from "@/db/schema";
import type { CheckinResult } from "@/lib/checkin-types";
import { maxAccuracyM } from "@/lib/config";
import { findOpenSessionForPoint } from "@/lib/geo";
import type { CheckinInput } from "@/lib/schemas";

const USER_AGENT_MAX = 300;

async function existingCheckIn(sessionId: string, userId: string) {
  const [row] = await getDb()
    .select({ checkedInAt: attendanceLogs.checkedInAt, method: attendanceLogs.method })
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.sessionId, sessionId), eq(attendanceLogs.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * The geofence check-in pipeline (after auth, rate limiting and input validation,
 * which the route handler does). The server alone decides "inside", using PostGIS
 * against the open session's copied geofence.
 *
 * Order: open session → already checked in → accuracy → distance → insert. An
 * existing check-in wins before accuracy and distance, so a member who reopens the
 * app later (from anywhere) still sees "you're checked in".
 */
export async function checkInWithGeofence(
  userId: string,
  reading: CheckinInput,
  userAgent: string | null,
  now = new Date(),
): Promise<CheckinResult> {
  const db = getDb();
  const match = await findOpenSessionForPoint(db, reading, now);
  if (!match) return { ok: false, reason: "NO_OPEN_SESSION" };

  const existing = await existingCheckIn(match.sessionId, userId);
  if (existing) {
    return {
      ok: true,
      alreadyCheckedIn: true,
      checkedInAt: existing.checkedInAt.toISOString(),
      method: existing.method,
    };
  }

  const maxAccuracy = maxAccuracyM();
  if (reading.accuracy > maxAccuracy) {
    return {
      ok: false,
      reason: "LOW_ACCURACY",
      accuracyM: Math.round(reading.accuracy),
      maxAccuracyM: maxAccuracy,
    };
  }

  if (!match.inside) {
    return {
      ok: false,
      reason: "OUTSIDE_GEOFENCE",
      distanceM: Math.round(match.distanceM),
      radiusM: match.radiusM,
    };
  }

  const [inserted] = await db
    .insert(attendanceLogs)
    .values({
      sessionId: match.sessionId,
      userId,
      checkedInAt: now,
      method: "auto_geofence",
      location: { lat: reading.lat, lng: reading.lng },
      accuracyM: reading.accuracy,
      distanceM: Math.round(match.distanceM * 10) / 10,
      userAgent: userAgent?.slice(0, USER_AGENT_MAX) ?? null,
    })
    .onConflictDoNothing({ target: [attendanceLogs.sessionId, attendanceLogs.userId] })
    .returning({ checkedInAt: attendanceLogs.checkedInAt, method: attendanceLogs.method });

  // Lost a race with a parallel request (two tabs): report the row that won.
  const row = inserted ?? (await existingCheckIn(match.sessionId, userId));
  return {
    ok: true,
    alreadyCheckedIn: !inserted,
    checkedInAt: row!.checkedInAt.toISOString(),
    method: row!.method,
  };
}
