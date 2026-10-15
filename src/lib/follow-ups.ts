import "server-only";

import { and, asc, desc, eq, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db/client";
import { followUps, users } from "@/db/schema";

export type FollowUpRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  /** The member's current run of missed Sundays (0 if they've since come back). */
  streak: number;
  streakAtOpen: number;
  openedAt: Date;
  lastAttended: string | null;
  notes: string | null;
  assignedTo: { id: string; name: string } | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
};

const assignee = alias(users, "assignee");
const resolver = alias(users, "resolver");

async function query(open: boolean, limit: number): Promise<FollowUpRow[]> {
  // Open: longest current streak first (most at risk). Resolved: most recent first.
  const order: SQL[] = open
    ? [desc(users.consecutiveAbsences), asc(followUps.openedAt)]
    : [desc(followUps.resolvedAt)];
  const rows = await getDb()
    .select({
      id: followUps.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      streak: users.consecutiveAbsences,
      streakAtOpen: followUps.streakAtOpen,
      openedAt: followUps.openedAt,
      lastAttended: sql<string | null>`(
        SELECT max(s.service_date)::text FROM attendance_logs a
        JOIN service_sessions s ON s.id = a.session_id
        WHERE a.user_id = ${users.id})`,
      notes: followUps.notes,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      resolvedAt: followUps.resolvedAt,
      resolvedBy: resolver.name,
    })
    .from(followUps)
    .innerJoin(users, eq(users.id, followUps.userId))
    .leftJoin(assignee, eq(assignee.id, followUps.assignedTo))
    .leftJoin(resolver, eq(resolver.id, followUps.resolvedBy))
    .where(open ? isNull(followUps.resolvedAt) : isNotNull(followUps.resolvedAt))
    .orderBy(...order)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    streak: row.streak,
    streakAtOpen: row.streakAtOpen,
    openedAt: row.openedAt,
    lastAttended: row.lastAttended,
    notes: row.notes,
    assignedTo: row.assigneeId ? { id: row.assigneeId, name: row.assigneeName ?? "" } : null,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
  }));
}

export const listOpenFollowUps = (limit = 200) => query(true, limit);
export const listResolvedFollowUps = (limit = 20) => query(false, limit);

/** People a follow-up can be assigned to: active admins (youth leaders). */
export async function listLeaders(): Promise<{ id: string; name: string }[]> {
  return getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)))
    .orderBy(users.name);
}

export type FollowUpChange = {
  notes?: string | null;
  assignedTo?: string | null;
  resolve?: boolean;
};

export type FollowUpError = "NOT_FOUND" | "ALREADY_RESOLVED" | "INVALID_ASSIGNEE";

/**
 * Updates notes or assignment, or resolves it. Resolving also clears the member's
 * flag (their streak stays as it is), so a new run of misses can flag them again.
 */
export async function updateFollowUp(
  id: string,
  change: FollowUpChange,
  adminId: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: FollowUpError }> {
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({ userId: followUps.userId, resolvedAt: followUps.resolvedAt })
      .from(followUps)
      .where(eq(followUps.id, id))
      .for("update");
    if (!current) return { ok: false, error: "NOT_FOUND" };
    if (current.resolvedAt) return { ok: false, error: "ALREADY_RESOLVED" };

    if (change.assignedTo) {
      const [leader] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.id, change.assignedTo), eq(users.role, "admin"), eq(users.isActive, true)),
        );
      if (!leader) return { ok: false, error: "INVALID_ASSIGNEE" };
    }

    await tx
      .update(followUps)
      .set({
        ...(change.notes !== undefined && { notes: change.notes?.trim() || null }),
        ...(change.assignedTo !== undefined && { assignedTo: change.assignedTo }),
        ...(change.resolve && { resolvedAt: now, resolvedBy: adminId }),
      })
      .where(eq(followUps.id, id));

    if (change.resolve) {
      await tx
        .update(users)
        .set({ isFlagged: false, flaggedAt: null })
        .where(eq(users.id, current.userId));
    }
    return { ok: true };
  });
}
