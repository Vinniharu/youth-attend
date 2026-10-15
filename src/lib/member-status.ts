import "server-only";

import { and, asc, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { attendanceLogs, excusals, serviceSessions, users } from "@/db/schema";
import type { MemberSession, MemberStatus } from "@/lib/checkin-types";

const toMemberSession = (s: {
  id: string;
  serviceDate: string;
  startsAt: Date;
  endsAt: Date;
}): MemberSession => ({
  id: s.id,
  serviceDate: s.serviceDate,
  startsAt: s.startsAt.toISOString(),
  endsAt: s.endsAt.toISOString(),
});

const sessionColumns = {
  id: serviceSessions.id,
  serviceDate: serviceSessions.serviceDate,
  startsAt: serviceSessions.startsAt,
  endsAt: serviceSessions.endsAt,
};

/** What the member home needs: the open session (and my check-in), or the next one. */
export async function getMemberStatus(userId: string, now = new Date()): Promise<MemberStatus> {
  const db = getDb();
  const [current] = await db
    .select({
      ...sessionColumns,
      checkedInAt: attendanceLogs.checkedInAt,
      method: attendanceLogs.method,
    })
    .from(serviceSessions)
    .leftJoin(
      attendanceLogs,
      and(eq(attendanceLogs.sessionId, serviceSessions.id), eq(attendanceLogs.userId, userId)),
    )
    .where(
      and(
        eq(serviceSessions.status, "open"),
        lte(serviceSessions.startsAt, now),
        gte(serviceSessions.endsAt, now),
      ),
    )
    .orderBy(desc(serviceSessions.startsAt))
    .limit(1);

  if (current) {
    return {
      current: {
        ...toMemberSession(current),
        checkIn:
          current.checkedInAt && current.method
            ? { checkedInAt: current.checkedInAt.toISOString(), method: current.method }
            : null,
      },
      next: null,
    };
  }

  const [next] = await db
    .select(sessionColumns)
    .from(serviceSessions)
    .where(
      and(inArray(serviceSessions.status, ["scheduled", "open"]), gt(serviceSessions.endsAt, now)),
    )
    .orderBy(asc(serviceSessions.startsAt))
    .limit(1);

  return { current: null, next: next ? toMemberSession(next) : null };
}

export type RecentSundays = { beats: boolean[]; attended: number };

/**
 * The member's last `count` finished services since they joined, oldest first:
 * true where they checked in. Excused Sundays are left out (neither a beat nor
 * a miss); cancelled ones never count.
 */
export async function getRecentSundays(userId: string, count = 8): Promise<RecentSundays> {
  const db = getDb();
  const rows = await db
    .select({
      attended: sql<boolean>`${attendanceLogs.userId} IS NOT NULL`,
    })
    .from(serviceSessions)
    .innerJoin(users, eq(users.id, userId))
    .leftJoin(
      attendanceLogs,
      and(eq(attendanceLogs.sessionId, serviceSessions.id), eq(attendanceLogs.userId, userId)),
    )
    .leftJoin(
      excusals,
      and(eq(excusals.sessionId, serviceSessions.id), eq(excusals.userId, userId)),
    )
    .where(
      and(
        inArray(serviceSessions.status, ["closed", "processed"]),
        gte(serviceSessions.startsAt, users.joinedAt),
        sql`${excusals.userId} IS NULL`,
      ),
    )
    .orderBy(desc(serviceSessions.startsAt))
    .limit(count);

  const beats = rows.map((r) => r.attended).reverse();
  return { beats, attended: beats.filter(Boolean).length };
}
