import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { followUps, notificationsLog, serviceSessions, users } from "@/db/schema";
import { absenceFlagThreshold } from "@/lib/config";
import { sendPendingNotifications, type SendSummary } from "@/lib/notifications";

// The absence engine (spec "Absence engine"). For every closed, unprocessed session,
// in ONE transaction, for each active member who had joined before it started:
//
//   attended → consecutive_absences = 0
//   excused  → no change
//   absent   → consecutive_absences + 1; queue `single_absence` if email_notifications
//   absent and streak ≥ ABSENCE_FLAG_THRESHOLD and not already flagged
//            → is_flagged, flagged_at, open a follow-up, queue an admin alert
//
// then mark the session processed. Emails go out after commit. Idempotent: a
// processed session is never touched again, and notifications_log's unique
// (user, session, type) means a retried send can't email anyone twice.

export type ProcessedSession = {
  sessionId: string;
  serviceDate: string;
  attended: number;
  excused: number;
  absent: number;
  newlyFlagged: number;
};

export type AbsenceRun = { sessions: ProcessedSession[]; emails: SendSummary };

/** Processes one session inside a transaction; null if it isn't closed-and-unprocessed. */
async function processSession(sessionId: string, now: Date): Promise<ProcessedSession | null> {
  return getDb().transaction(async (tx) => {
    // Lock the session so two runs (cron + an admin's button) can't both process it.
    const [session] = await tx
      .select({
        id: serviceSessions.id,
        serviceDate: serviceSessions.serviceDate,
        startsAt: serviceSessions.startsAt,
      })
      .from(serviceSessions)
      .where(
        and(
          eq(serviceSessions.id, sessionId),
          eq(serviceSessions.status, "closed"),
          isNull(serviceSessions.absencesProcessedAt),
        ),
      )
      .for("update");
    if (!session) return null;

    // Who counts: active members who had joined before the service began.
    const eligible = sql`
      ${users.role} = 'member' AND ${users.isActive} AND ${users.joinedAt} < ${session.startsAt}`;
    const attendedHere = sql`EXISTS (SELECT 1 FROM attendance_logs a
      WHERE a.user_id = ${users.id} AND a.session_id = ${session.id})`;
    const excusedHere = sql`EXISTS (SELECT 1 FROM excusals e
      WHERE e.user_id = ${users.id} AND e.session_id = ${session.id})`;

    const attended = await tx
      .update(users)
      .set({ consecutiveAbsences: 0 })
      .where(sql`${eligible} AND ${attendedHere}`)
      .returning({ id: users.id });

    const [excused] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${eligible} AND NOT ${attendedHere} AND ${excusedHere}`);

    const absent = await tx
      .update(users)
      .set({ consecutiveAbsences: sql`${users.consecutiveAbsences} + 1` })
      .where(sql`${eligible} AND NOT ${attendedHere} AND NOT ${excusedHere}`)
      .returning({
        id: users.id,
        streak: users.consecutiveAbsences,
        isFlagged: users.isFlagged,
        emailNotifications: users.emailNotifications,
      });

    const threshold = absenceFlagThreshold();
    const toEmail = absent.filter((m) => m.emailNotifications);
    const toFlag = absent.filter((m) => m.streak >= threshold && !m.isFlagged);

    if (toEmail.length) {
      await tx
        .insert(notificationsLog)
        .values(
          toEmail.map((m) => ({
            userId: m.id,
            sessionId: session.id,
            type: "single_absence" as const,
          })),
        )
        .onConflictDoNothing();
    }
    for (const member of toFlag) {
      await tx
        .update(users)
        .set({ isFlagged: true, flaggedAt: now })
        .where(eq(users.id, member.id));
      // The partial unique index allows one open follow-up per member.
      await tx
        .insert(followUps)
        .values({ userId: member.id, openedAt: now, streakAtOpen: member.streak })
        .onConflictDoNothing();
      await tx
        .insert(notificationsLog)
        .values({ userId: member.id, sessionId: session.id, type: "flagged_member" })
        .onConflictDoNothing();
    }

    await tx
      .update(serviceSessions)
      .set({ status: "processed", absencesProcessedAt: now })
      .where(eq(serviceSessions.id, session.id));

    return {
      sessionId: session.id,
      serviceDate: session.serviceDate,
      attended: attended.length,
      excused: excused?.n ?? 0,
      absent: absent.length,
      newlyFlagged: toFlag.length,
    };
  });
}

/**
 * Processes every closed, unprocessed session (oldest first), or just `onlySessionId`,
 * then sends the queued emails. Cancelled sessions are never closed, so never touched.
 */
export async function processAbsences(
  options: { onlySessionId?: string; now?: Date } = {},
): Promise<AbsenceRun> {
  const now = options.now ?? new Date();
  const due = await getDb()
    .select({ id: serviceSessions.id })
    .from(serviceSessions)
    .where(
      and(
        eq(serviceSessions.status, "closed"),
        isNull(serviceSessions.absencesProcessedAt),
        options.onlySessionId ? eq(serviceSessions.id, options.onlySessionId) : undefined,
      ),
    )
    .orderBy(asc(serviceSessions.startsAt));

  const sessions: ProcessedSession[] = [];
  for (const { id } of due) {
    const processed = await processSession(id, now);
    if (processed) sessions.push(processed);
  }
  // After commit: a send failure never rolls back attendance or streaks.
  const emails = await sendPendingNotifications();
  return { sessions, emails };
}
