import "server-only";

import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { serviceSessions, users } from "@/db/schema";
import { appTimeZone } from "@/lib/config";
import { zonedDate } from "@/lib/time";

export type MemberCounts = { members: number; flagged: number };

/** Active members and how many of them are flagged for follow-up (one query). */
export async function getMemberCounts(): Promise<MemberCounts> {
  const [row] = await getDb()
    .select({
      members: count(),
      flagged: sql<number>`count(*) filter (where ${users.isFlagged})`.mapWith(Number),
    })
    .from(users)
    .where(and(eq(users.role, "member"), eq(users.isActive, true)));
  return { members: row?.members ?? 0, flagged: row?.flagged ?? 0 };
}

const attendedCount = sql<number>`(
  SELECT count(*) FROM attendance_logs a WHERE a.session_id = "service_sessions"."id")`.mapWith(
  Number,
);
const excusedCount = sql<number>`(
  SELECT count(*) FROM excusals e WHERE e.session_id = "service_sessions"."id")`.mapWith(Number);
/** Active members who had joined before the service (today's roster, not a snapshot). */
const expectedCount = sql<number>`(
  SELECT count(*) FROM users u
  WHERE u.role = 'member' AND u.is_active AND u.joined_at < "service_sessions"."starts_at")`.mapWith(
  Number,
);

const sessionSummary = {
  id: serviceSessions.id,
  serviceDate: serviceSessions.serviceDate,
  startsAt: serviceSessions.startsAt,
  endsAt: serviceSessions.endsAt,
  status: serviceSessions.status,
  attended: attendedCount,
  excused: excusedCount,
  expected: expectedCount,
};

export type SundaySummary = {
  id: string;
  serviceDate: string;
  startsAt: Date;
  endsAt: Date;
  status: (typeof serviceSessions.$inferSelect)["status"];
  attended: number;
  excused: number;
  expected: number;
};

/**
 * The Sunday to show on the dashboard: today's session if there is one, else the
 * next upcoming one, else the most recent. Cancelled sessions are skipped.
 */
export async function getThisSunday(now = new Date()): Promise<SundaySummary | null> {
  const db = getDb();
  const today = zonedDate(now, appTimeZone());
  const live = inArray(serviceSessions.status, ["scheduled", "open", "closed", "processed"]);
  const [upcoming] = await db
    .select(sessionSummary)
    .from(serviceSessions)
    .where(and(live, gte(serviceSessions.serviceDate, today)))
    .orderBy(serviceSessions.serviceDate)
    .limit(1);
  if (upcoming) return upcoming;
  const [latest] = await db
    .select(sessionSummary)
    .from(serviceSessions)
    .where(and(live, lt(serviceSessions.serviceDate, today)))
    .orderBy(desc(serviceSessions.serviceDate))
    .limit(1);
  return latest ?? null;
}

export type TrendPoint = { serviceDate: string; attended: number; expected: number };

/** The last `weeks` finished Sundays (closed or processed), oldest first. */
export async function getAttendanceTrend(weeks = 12): Promise<TrendPoint[]> {
  const rows = await getDb()
    .select({
      serviceDate: serviceSessions.serviceDate,
      attended: attendedCount,
      expected: expectedCount,
    })
    .from(serviceSessions)
    .where(inArray(serviceSessions.status, ["closed", "processed"]))
    .orderBy(desc(serviceSessions.serviceDate))
    .limit(weeks);
  return rows.reverse();
}
