import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { attendanceLogs, excusals, serviceSessions, session, users } from "@/db/schema";
import { parseCsv } from "@/lib/csv";
import { type MemberChangeInput, newMemberInput, type NewMemberInput } from "@/lib/schemas";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "member" | "admin";
  isActive: boolean;
  isFlagged: boolean;
  consecutiveAbsences: number;
  emailNotifications: boolean;
  joinedAt: Date;
};

const memberColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  role: users.role,
  isActive: users.isActive,
  isFlagged: users.isFlagged,
  consecutiveAbsences: users.consecutiveAbsences,
  emailNotifications: users.emailNotifications,
  joinedAt: users.joinedAt,
};

/** Everyone (members and leaders), filtered by name/email/phone; active first, then A–Z. */
export async function listMembers(search = ""): Promise<MemberRow[]> {
  const q = search.trim();
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return getDb()
    .select(memberColumns)
    .from(users)
    .where(
      q
        ? or(ilike(users.name, like), ilike(users.email, like), ilike(users.phone, like))
        : undefined,
    )
    .orderBy(desc(users.isActive), asc(users.name))
    .limit(1000);
}

export async function getMember(id: string): Promise<MemberRow | null> {
  const [row] = await getDb().select(memberColumns).from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export type MemberError = "EMAIL_TAKEN" | "NOT_FOUND" | "SELF_CHANGE";

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "cause" in error &&
  (error.cause as { code?: string } | undefined)?.code === "23505";

/** Adds a member (no open sign-up: this is how people join). They sign in with a code. */
export async function createMember(
  input: NewMemberInput,
): Promise<{ ok: true; member: MemberRow } | { ok: false; error: MemberError }> {
  try {
    const [member] = await getDb()
      .insert(users)
      .values({
        id: randomUUID(),
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        role: input.role,
      })
      .returning(memberColumns);
    return { ok: true, member: member! };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "EMAIL_TAKEN" };
    throw error;
  }
}

/**
 * Edits a member. Deactivating ends their sessions at once. An admin can't
 * deactivate or demote themselves (so there's always someone who can undo it).
 */
export async function updateMember(
  id: string,
  change: MemberChangeInput,
  actingAdminId: string,
): Promise<{ ok: true; member: MemberRow } | { ok: false; error: MemberError }> {
  if (id === actingAdminId && (change.isActive === false || change.role === "member")) {
    return { ok: false, error: "SELF_CHANGE" };
  }
  try {
    return await getDb().transaction(async (tx) => {
      const [member] = await tx
        .update(users)
        .set({
          ...(change.name !== undefined && { name: change.name }),
          ...(change.email !== undefined && { email: change.email }),
          ...(change.phone !== undefined && { phone: change.phone || null }),
          ...(change.role !== undefined && { role: change.role }),
          ...(change.isActive !== undefined && { isActive: change.isActive }),
        })
        .where(eq(users.id, id))
        .returning(memberColumns);
      if (!member) return { ok: false as const, error: "NOT_FOUND" as const };
      if (change.isActive === false) await tx.delete(session).where(eq(session.userId, id));
      return { ok: true as const, member };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "EMAIL_TAKEN" };
    throw error;
  }
}

export type HistoryEntry = {
  sessionId: string;
  serviceDate: string;
  outcome: "attended" | "excused" | "absent" | "upcoming";
  method: string | null;
};

/**
 * A member's Sundays since they joined, newest first: attended, excused, absent
 * (only once the session has finished), or still to come. Cancelled ones are left out.
 */
export async function getMemberHistory(userId: string, limit = 52): Promise<HistoryEntry[]> {
  const [member] = await getDb()
    .select({ joinedAt: users.joinedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!member) return [];
  const rows = await getDb()
    .select({
      sessionId: serviceSessions.id,
      serviceDate: serviceSessions.serviceDate,
      status: serviceSessions.status,
      method: attendanceLogs.method,
      excused: sql<boolean>`${excusals.userId} IS NOT NULL`,
    })
    .from(serviceSessions)
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
        inArray(serviceSessions.status, ["scheduled", "open", "closed", "processed"]),
        sql`${serviceSessions.endsAt} > ${member.joinedAt}`,
      ),
    )
    .orderBy(desc(serviceSessions.serviceDate))
    .limit(limit);

  return rows.map((r) => ({
    sessionId: r.sessionId,
    serviceDate: r.serviceDate,
    method: r.method,
    outcome: r.method
      ? "attended"
      : r.excused
        ? "excused"
        : r.status === "closed" || r.status === "processed"
          ? "absent"
          : "upcoming",
  }));
}

export type ImportResult = {
  created: number;
  skipped: { line: number; email: string; reason: string }[];
  errors: { line: number; message: string }[];
};

const IMPORT_LIMIT = 2000;

/**
 * Imports members from CSV with a header row: `name,email[,phone]` (any order,
 * case-insensitive). Existing emails are skipped, not changed. Invalid rows are
 * reported by line; valid rows are still imported.
 */
export async function importMembersCsv(text: string): Promise<ImportResult> {
  const rows = parseCsv(text);
  const result: ImportResult = { created: 0, skipped: [], errors: [] };
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (name: string) => header.indexOf(name);
  if (col("name") < 0 || col("email") < 0) {
    result.errors.push({
      line: 1,
      message: "The first row must name the columns: name, email (and optionally phone).",
    });
    return result;
  }
  if (rows.length > IMPORT_LIMIT) {
    result.errors.push({ line: 1, message: `Import at most ${IMPORT_LIMIT} members at a time.` });
    return result;
  }

  // Undo the apostrophe our own export adds before =, +, -, @ (formula guard), so an
  // exported file re-imports cleanly (e.g. phone numbers starting with +).
  const cell = (cells: string[], name: string) =>
    col(name) >= 0 ? (cells[col(name)] ?? "").replace(/^'(?=[=+\-@])/, "") : "";

  const seen = new Set<string>();
  const valid: { line: number; input: NewMemberInput }[] = [];
  rows.forEach((cells, i) => {
    const line = i + 2;
    const parsed = newMemberInput.safeParse({
      name: cell(cells, "name"),
      email: cell(cells, "email"),
      phone: cell(cells, "phone"),
      role: "member",
    });
    if (!parsed.success) {
      result.errors.push({ line, message: parsed.error.issues[0]?.message ?? "Invalid row" });
    } else if (seen.has(parsed.data.email)) {
      result.skipped.push({ line, email: parsed.data.email, reason: "repeated in this file" });
    } else {
      seen.add(parsed.data.email);
      valid.push({ line, input: parsed.data });
    }
  });
  if (valid.length === 0) return result;

  const existing = new Set(
    (
      await getDb()
        .select({ email: users.email })
        .from(users)
        .where(inArray(users.email, [...seen]))
    ).map((r) => r.email.toLowerCase()),
  );
  const fresh = valid.filter((v) => {
    if (!existing.has(v.input.email)) return true;
    result.skipped.push({ line: v.line, email: v.input.email, reason: "already a member" });
    return false;
  });
  if (fresh.length) {
    const inserted = await getDb()
      .insert(users)
      .values(
        fresh.map(({ input }) => ({
          id: randomUUID(),
          name: input.name,
          email: input.email,
          phone: input.phone || null,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: users.id });
    result.created = inserted.length;
  }
  return result;
}

/** Members CSV export rows (header first). */
export async function exportMembersRows(): Promise<unknown[][]> {
  const rows = await getDb().select(memberColumns).from(users).orderBy(asc(users.name));
  return [
    ["name", "email", "phone", "role", "active", "joined", "missed_in_a_row", "flagged", "emails"],
    ...rows.map((m) => [
      m.name,
      m.email,
      m.phone,
      m.role,
      m.isActive ? "yes" : "no",
      m.joinedAt.toISOString().slice(0, 10),
      m.consecutiveAbsences,
      m.isFlagged ? "yes" : "no",
      m.emailNotifications ? "on" : "off",
    ]),
  ];
}

/** Attendance CSV export rows (header first): one row per check-in. */
export async function exportAttendanceRows(): Promise<unknown[][]> {
  const rows = await getDb()
    .select({
      serviceDate: serviceSessions.serviceDate,
      name: users.name,
      email: users.email,
      method: attendanceLogs.method,
      checkedInAt: attendanceLogs.checkedInAt,
    })
    .from(attendanceLogs)
    .innerJoin(users, eq(users.id, attendanceLogs.userId))
    .innerJoin(serviceSessions, eq(serviceSessions.id, attendanceLogs.sessionId))
    .orderBy(desc(serviceSessions.serviceDate), asc(users.name));
  return [
    ["service_date", "name", "email", "method", "checked_in_at"],
    ...rows.map((r) => [r.serviceDate, r.name, r.email, r.method, r.checkedInAt.toISOString()]),
  ];
}
