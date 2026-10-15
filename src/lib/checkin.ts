import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { attendanceLogs, serviceSessions, users } from "@/db/schema";
import type { CheckinMethod, CheckinResult } from "@/lib/checkin-types";
import { maxAccuracyM, qrMaxAccuracyM } from "@/lib/config";
import { distanceToSession, findOpenSessionForPoint } from "@/lib/geo";
import { parseQrToken, verifyQrToken } from "@/lib/qr-token";
import { createRateLimiter } from "@/lib/rate-limit";
import type { CheckinInput } from "@/lib/schemas";

const USER_AGENT_MAX = 300;

/**
 * One limiter for every member check-in method (5 attempts per 5 minutes), so
 * switching from GPS to QR can't double a member's attempts. Kept on globalThis:
 * each route handler is bundled separately and must still share this instance.
 */
const globalForCheckin = globalThis as unknown as {
  checkinLimiter?: ReturnType<typeof createRateLimiter>;
};
export const checkinLimiter = (globalForCheckin.checkinLimiter ??= createRateLimiter({
  limit: 5,
  windowMs: 5 * 60_000,
}));

async function existingCheckIn(sessionId: string, userId: string) {
  const [row] = await getDb()
    .select({ checkedInAt: attendanceLogs.checkedInAt, method: attendanceLogs.method })
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.sessionId, sessionId), eq(attendanceLogs.userId, userId)))
    .limit(1);
  return row ?? null;
}

const alreadyIn = (row: { checkedInAt: Date; method: CheckinMethod }): CheckinResult => ({
  ok: true,
  alreadyCheckedIn: true,
  checkedInAt: row.checkedInAt.toISOString(),
  method: row.method,
});

type Attendance = {
  sessionId: string;
  userId: string;
  method: CheckinMethod;
  now: Date;
  reading?: CheckinInput;
  distanceM?: number;
  userAgent?: string | null;
  recordedBy?: string;
};

/** Inserts the attendance row once (`ON CONFLICT DO NOTHING`) and reports the row that counts. */
async function record(a: Attendance): Promise<CheckinResult> {
  const [inserted] = await getDb()
    .insert(attendanceLogs)
    .values({
      sessionId: a.sessionId,
      userId: a.userId,
      checkedInAt: a.now,
      method: a.method,
      location: a.reading ? { lat: a.reading.lat, lng: a.reading.lng } : null,
      accuracyM: a.reading?.accuracy ?? null,
      distanceM: a.distanceM === undefined ? null : Math.round(a.distanceM * 10) / 10,
      userAgent: a.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
      recordedBy: a.recordedBy ?? null,
    })
    .onConflictDoNothing({ target: [attendanceLogs.sessionId, attendanceLogs.userId] })
    .returning({ checkedInAt: attendanceLogs.checkedInAt, method: attendanceLogs.method });

  // Lost a race with a parallel request (two tabs): report the row that won.
  const row = inserted ?? (await existingCheckIn(a.sessionId, a.userId));
  return {
    ok: true,
    alreadyCheckedIn: !inserted,
    checkedInAt: row!.checkedInAt.toISOString(),
    method: row!.method,
  };
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
  const match = await findOpenSessionForPoint(getDb(), reading, now);
  if (!match) return { ok: false, reason: "NO_OPEN_SESSION" };

  const existing = await existingCheckIn(match.sessionId, userId);
  if (existing) return alreadyIn(existing);

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

  return record({
    sessionId: match.sessionId,
    userId,
    method: "auto_geofence",
    now,
    reading,
    distanceM: match.distanceM,
    userAgent,
  });
}

/**
 * The QR check-in pipeline. The rotating token proves the member is looking at the
 * church screen right now, so the location check is relaxed (the user's choice):
 * accuracy up to `qrMaxAccuracyM()` (default 150 m) and the reading's accuracy
 * counts in the member's favour. A forwarded code used from home still fails,
 * because home is far outside any geofence.
 *
 * Order: token → session open → already checked in → accuracy → distance → insert.
 */
export async function checkInWithQr(
  userId: string,
  token: string,
  reading: CheckinInput,
  userAgent: string | null,
  now = new Date(),
): Promise<CheckinResult> {
  const parsed = parseQrToken(token);
  if (!parsed) return { ok: false, reason: "INVALID_QR" };

  const db = getDb();
  const [session] = await db
    .select({
      id: serviceSessions.id,
      status: serviceSessions.status,
      startsAt: serviceSessions.startsAt,
      endsAt: serviceSessions.endsAt,
      qrSecret: serviceSessions.qrSecret,
    })
    .from(serviceSessions)
    .where(eq(serviceSessions.id, parsed.sessionId))
    .limit(1);
  if (!session) return { ok: false, reason: "INVALID_QR" };

  const verdict = verifyQrToken(parsed, session.qrSecret, now);
  if (verdict === "invalid") return { ok: false, reason: "INVALID_QR" };
  if (verdict === "expired") return { ok: false, reason: "EXPIRED_QR" };

  const open = session.status === "open" && session.startsAt <= now && now <= session.endsAt;
  if (!open) return { ok: false, reason: "NO_OPEN_SESSION" };

  const existing = await existingCheckIn(session.id, userId);
  if (existing) return alreadyIn(existing);

  const maxAccuracy = qrMaxAccuracyM();
  if (reading.accuracy > maxAccuracy) {
    return {
      ok: false,
      reason: "LOW_ACCURACY",
      accuracyM: Math.round(reading.accuracy),
      maxAccuracyM: maxAccuracy,
    };
  }

  const measured = await distanceToSession(db, session.id, reading);
  if (!measured) return { ok: false, reason: "INVALID_QR" };
  if (measured.distanceM > measured.radiusM + reading.accuracy) {
    return {
      ok: false,
      reason: "OUTSIDE_GEOFENCE",
      distanceM: Math.round(measured.distanceM),
      radiusM: measured.radiusM,
    };
  }

  return record({
    sessionId: session.id,
    userId,
    method: "qr_scan",
    now,
    reading,
    distanceM: measured.distanceM,
    userAgent,
  });
}

export type ManualCheckinError = "SESSION_NOT_FOUND" | "SESSION_LOCKED" | "MEMBER_NOT_FOUND";

/**
 * An admin marks a member present (no location). Allowed until the absence engine
 * has processed the session (scheduled, open or closed), so a late correction on
 * Sunday afternoon still counts; processed sessions would leave streaks wrong, and
 * cancelled ones don't count at all.
 */
export async function recordManualCheckIn(
  adminId: string,
  sessionId: string,
  userId: string,
  now = new Date(),
): Promise<CheckinResult | { ok: false; error: ManualCheckinError }> {
  const db = getDb();
  const [[session], [member]] = await Promise.all([
    db
      .select({ status: serviceSessions.status })
      .from(serviceSessions)
      .where(eq(serviceSessions.id, sessionId))
      .limit(1),
    db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1),
  ]);
  if (!session) return { ok: false, error: "SESSION_NOT_FOUND" };
  if (session.status === "cancelled" || session.status === "processed") {
    return { ok: false, error: "SESSION_LOCKED" };
  }
  if (!member) return { ok: false, error: "MEMBER_NOT_FOUND" };

  return record({ sessionId, userId, method: "manual_admin", now, recordedBy: adminId });
}
