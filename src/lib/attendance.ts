import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { displayName } from "@/db/display-name";
import { attendanceLogs, excusals, serviceSessions, users } from "@/db/schema";
import type { CheckinMethod } from "@/lib/checkin-types";

export type SessionAttendance = {
  session: {
    id: string;
    serviceDate: string;
    startsAt: Date;
    endsAt: Date;
    status: (typeof serviceSessions.$inferSelect)["status"];
    radiusM: number;
  };
  attended: {
    userId: string;
    name: string;
    method: CheckinMethod;
    checkedInAt: Date;
    distanceM: number | null;
    recordedBy: string | null;
  }[];
  excused: { userId: string; name: string; reason: string | null }[];
  /**
   * Active members who are neither present nor excused, including anyone added on
   * the day (a first-timer can still be marked present). Absence counting has its
   * own rule (joined before the service) in the absence engine.
   */
  notCheckedIn: { userId: string; name: string; email: string; consecutiveAbsences: number }[];
};

/** Who came, who was excused and who is missing for one session; null if it doesn't exist. */
export async function getSessionAttendance(sessionId: string): Promise<SessionAttendance | null> {
  const db = getDb();
  const [session] = await db
    .select({
      id: serviceSessions.id,
      serviceDate: serviceSessions.serviceDate,
      startsAt: serviceSessions.startsAt,
      endsAt: serviceSessions.endsAt,
      status: serviceSessions.status,
      radiusM: serviceSessions.radiusM,
    })
    .from(serviceSessions)
    .where(eq(serviceSessions.id, sessionId))
    .limit(1);
  if (!session) return null;

  const [attended, excused, notCheckedIn] = await Promise.all([
    db
      .select({
        userId: attendanceLogs.userId,
        name: displayName,
        method: attendanceLogs.method,
        checkedInAt: attendanceLogs.checkedInAt,
        distanceM: attendanceLogs.distanceM,
        recordedBy: attendanceLogs.recordedBy,
      })
      .from(attendanceLogs)
      .innerJoin(users, eq(users.id, attendanceLogs.userId))
      .where(eq(attendanceLogs.sessionId, sessionId))
      .orderBy(asc(attendanceLogs.checkedInAt)),
    db
      .select({ userId: excusals.userId, name: displayName, reason: excusals.reason })
      .from(excusals)
      .innerJoin(users, eq(users.id, excusals.userId))
      .where(eq(excusals.sessionId, sessionId))
      .orderBy(asc(users.name)),
    db
      .select({
        userId: users.id,
        name: displayName,
        email: users.email,
        consecutiveAbsences: users.consecutiveAbsences,
      })
      .from(users)
      .leftJoin(
        attendanceLogs,
        and(eq(attendanceLogs.userId, users.id), eq(attendanceLogs.sessionId, sessionId)),
      )
      .leftJoin(excusals, and(eq(excusals.userId, users.id), eq(excusals.sessionId, sessionId)))
      .where(
        and(
          eq(users.role, "member"),
          eq(users.isActive, true),
          isNull(attendanceLogs.id),
          sql`${excusals.userId} IS NULL`,
        ),
      )
      .orderBy(asc(users.name)),
  ]);

  return { session, attended, excused, notCheckedIn };
}
