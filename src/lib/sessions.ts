import "server-only";

import { randomBytes } from "node:crypto";

import { asc, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { serviceSessions, type ServiceSession } from "@/db/schema";
import { getDefaultLocation } from "@/lib/location";
import type { CreateSessionInput, UpdateSessionInput } from "@/lib/schemas";
import { zonedDateTimeToUtc } from "@/lib/time";

type Status = ServiceSession["status"];

export type SessionErrorCode =
  "NO_LOCATION" | "SESSION_EXISTS" | "NOT_FOUND" | "INVALID_TRANSITION" | "LOCKED";

/** An expected, user-facing failure. Route handlers map `code` to a 4xx. */
export class SessionError extends Error {
  constructor(readonly code: SessionErrorCode) {
    super(code);
    this.name = "SessionError";
  }
}

/**
 * Status changes an admin may make. A cancelled session can be restored (the
 * absence engine skips it, so nothing is lost); processed sessions are final.
 */
const TRANSITIONS: Record<Status, readonly Status[]> = {
  scheduled: ["open", "cancelled"],
  open: ["closed", "cancelled"],
  closed: ["open", "cancelled"],
  cancelled: ["scheduled"],
  processed: [],
};

/** Upcoming sessions are bounded by how far ahead admins plan; this is a safety cap. */
const UPCOMING_CAP = 200;

/** A session as admins see it: never includes the QR secret. */
export type SessionSummary = Omit<ServiceSession, "qrSecret"> & {
  attended: number;
  excused: number;
};

const summaryColumns = {
  id: serviceSessions.id,
  serviceDate: serviceSessions.serviceDate,
  startsAt: serviceSessions.startsAt,
  endsAt: serviceSessions.endsAt,
  center: serviceSessions.center,
  radiusM: serviceSessions.radiusM,
  status: serviceSessions.status,
  absencesProcessedAt: serviceSessions.absencesProcessedAt,
  createdAt: serviceSessions.createdAt,
};

function windowFor(serviceDate: string, start: string, end: string, timeZone: string) {
  return {
    startsAt: zonedDateTimeToUtc(serviceDate, start, timeZone),
    endsAt: zonedDateTimeToUtc(serviceDate, end, timeZone),
  };
}

/**
 * Creates the session for `serviceDate`, copying the current default geofence so
 * later geofence edits never rewrite history. Each session gets a fresh QR secret.
 */
export async function createSession(
  input: CreateSessionInput,
  timeZone: string,
): Promise<SessionSummary> {
  const location = await getDefaultLocation();
  if (!location) throw new SessionError("NO_LOCATION");

  const [row] = await getDb()
    .insert(serviceSessions)
    .values({
      serviceDate: input.serviceDate,
      ...windowFor(input.serviceDate, input.start, input.end, timeZone),
      center: location.center,
      radiusM: location.radiusM,
      qrSecret: randomBytes(32).toString("base64url"),
    })
    .onConflictDoNothing({ target: serviceSessions.serviceDate })
    .returning(summaryColumns);
  if (!row) throw new SessionError("SESSION_EXISTS");
  return { ...row, attended: 0, excused: 0 };
}

// Correlated counts: the cost grows with the sessions returned, not with all history.
// The outer id is written out in full: Drizzle renders `${serviceSessions.id}` as a
// bare "id", which inside the subquery would bind to attendance_logs.id instead.
const counts = {
  attended:
    sql<number>`(SELECT count(*) FROM attendance_logs a WHERE a.session_id = "service_sessions"."id")`.mapWith(
      Number,
    ),
  excused:
    sql<number>`(SELECT count(*) FROM excusals e WHERE e.session_id = "service_sessions"."id")`.mapWith(
      Number,
    ),
};

/**
 * Every session from `today` on (soonest first) and the most recent `pastLimit`
 * before it (newest first), each with check-in and excusal counts.
 */
export async function listSessions(
  today: string,
  pastLimit = 26,
): Promise<{ upcoming: SessionSummary[]; past: SessionSummary[] }> {
  const db = getDb();
  const [upcoming, past] = await Promise.all([
    db
      .select({ ...summaryColumns, ...counts })
      .from(serviceSessions)
      .where(gte(serviceSessions.serviceDate, today))
      .orderBy(asc(serviceSessions.serviceDate))
      .limit(UPCOMING_CAP),
    db
      .select({ ...summaryColumns, ...counts })
      .from(serviceSessions)
      .where(lt(serviceSessions.serviceDate, today))
      .orderBy(desc(serviceSessions.serviceDate))
      .limit(pastLimit),
  ]);
  return { upcoming, past };
}

/**
 * Changes a session's window and/or status. The row is locked for the duration,
 * so two admins can't make conflicting changes. Processed sessions are read-only;
 * cancelled ones can only be restored.
 */
export async function updateSession(
  id: string,
  input: UpdateSessionInput,
  timeZone: string,
): Promise<Omit<ServiceSession, "qrSecret">> {
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({ status: serviceSessions.status, serviceDate: serviceSessions.serviceDate })
      .from(serviceSessions)
      .where(eq(serviceSessions.id, id))
      .for("update");
    if (!current) throw new SessionError("NOT_FOUND");
    if (current.status === "processed") throw new SessionError("LOCKED");
    // Restore a cancelled session before changing its times.
    if (input.window && current.status === "cancelled") throw new SessionError("LOCKED");
    if (input.status && !TRANSITIONS[current.status].includes(input.status)) {
      throw new SessionError("INVALID_TRANSITION");
    }

    const [row] = await tx
      .update(serviceSessions)
      .set({
        ...(input.window &&
          windowFor(current.serviceDate, input.window.start, input.window.end, timeZone)),
        ...(input.status && { status: input.status }),
      })
      .where(eq(serviceSessions.id, id))
      .returning(summaryColumns);
    return row!;
  });
}
