import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { attendanceLogs, excusals, serviceSessions } from "@/db/schema";

export type ExcusalError = "SESSION_NOT_FOUND" | "SESSION_LOCKED" | "ALREADY_CHECKED_IN";

async function editable(sessionId: string) {
  const [s] = await getDb()
    .select({ status: serviceSessions.status })
    .from(serviceSessions)
    .where(eq(serviceSessions.id, sessionId));
  if (!s) return "SESSION_NOT_FOUND" as const;
  // After processing, streaks are already counted; cancelled Sundays don't count.
  if (s.status === "processed" || s.status === "cancelled") return "SESSION_LOCKED" as const;
  return null;
}

/** Excuses a member from one Sunday (travel, illness): no absence, no email. */
export async function addExcusal(
  sessionId: string,
  userId: string,
  reason: string | undefined,
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: ExcusalError }> {
  const blocked = await editable(sessionId);
  if (blocked) return { ok: false, error: blocked };
  const [present] = await getDb()
    .select({ id: attendanceLogs.id })
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.sessionId, sessionId), eq(attendanceLogs.userId, userId)));
  if (present) return { ok: false, error: "ALREADY_CHECKED_IN" };
  await getDb()
    .insert(excusals)
    .values({ sessionId, userId, reason: reason || null, createdBy: adminId })
    .onConflictDoUpdate({
      target: [excusals.sessionId, excusals.userId],
      set: { reason: reason || null, createdBy: adminId },
    });
  return { ok: true };
}

export async function removeExcusal(
  sessionId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: ExcusalError }> {
  const blocked = await editable(sessionId);
  if (blocked) return { ok: false, error: blocked };
  await getDb()
    .delete(excusals)
    .where(and(eq(excusals.sessionId, sessionId), eq(excusals.userId, userId)));
  return { ok: true };
}
