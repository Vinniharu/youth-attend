import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { attendanceLogs, followUps, serviceSessions, session, users } from "@/db/schema";
import { addExcusal, removeExcusal } from "@/lib/excusals";
import { listOpenFollowUps, updateFollowUp } from "@/lib/follow-ups";
import {
  createMember,
  exportAttendanceRows,
  getMemberHistory,
  importMembersCsv,
  listMembers,
  updateMember,
} from "@/lib/members";
import { getAttendanceTrend, getThisSunday } from "@/lib/stats";

import { insertSession, insertUser, truncateAll } from "./helpers";

const CHURCH = { lat: 6.5244, lng: 3.3792 };
const DAY = 86_400_000;
const now = Date.now();

beforeEach(truncateAll);
afterAll(closeDb);

describe("follow-ups", () => {
  async function flagged(streak: number, name: string) {
    const member = await insertUser({ name, consecutiveAbsences: streak, isFlagged: true });
    const [f] = await getDb()
      .insert(followUps)
      .values({ userId: member.id, streakAtOpen: 3 })
      .returning();
    return { member, followUp: f! };
  }

  it("lists open follow-ups longest streak first, with last attendance", async () => {
    await flagged(3, "Three");
    const { member } = await flagged(6, "Six");
    const s = await insertSession(CHURCH, { serviceDate: "2026-09-27", status: "processed" });
    await getDb()
      .insert(attendanceLogs)
      .values({ sessionId: s.id, userId: member.id, method: "qr_scan" });

    const open = await listOpenFollowUps();
    expect(open.map((f) => f.name)).toEqual(["Six", "Three"]);
    expect(open[0]?.lastAttended).toBe("2026-09-27");
  });

  it("saves notes, assigns a leader, and resolving clears the flag (not the streak)", async () => {
    const leader = await insertUser({ role: "admin", name: "Ada" });
    const { member, followUp } = await flagged(4, "Tobi");

    expect(await updateFollowUp(followUp.id, { notes: "  Called, unwell  " }, leader.id)).toEqual({
      ok: true,
    });
    expect(await updateFollowUp(followUp.id, { assignedTo: leader.id }, leader.id)).toEqual({
      ok: true,
    });
    const [open] = await listOpenFollowUps();
    expect(open).toMatchObject({
      notes: "Called, unwell",
      assignedTo: { id: leader.id, name: "Ada" },
    });

    expect(await updateFollowUp(followUp.id, { resolve: true }, leader.id)).toEqual({ ok: true });
    const [after] = await getDb().select().from(users).where(eq(users.id, member.id));
    expect(after).toMatchObject({ isFlagged: false, flaggedAt: null, consecutiveAbsences: 4 });
    expect(await listOpenFollowUps()).toEqual([]);
    expect(await updateFollowUp(followUp.id, { notes: "late" }, leader.id)).toEqual({
      ok: false,
      error: "ALREADY_RESOLVED",
    });
  });

  it("only assigns to active leaders", async () => {
    const leader = await insertUser({ role: "admin" });
    const notLeader = await insertUser();
    const { followUp } = await flagged(3, "Tobi");
    expect(await updateFollowUp(followUp.id, { assignedTo: notLeader.id }, leader.id)).toEqual({
      ok: false,
      error: "INVALID_ASSIGNEE",
    });
  });
});

describe("members", () => {
  it("adds members, rejects duplicate emails case-insensitively, and searches", async () => {
    const created = await createMember({
      name: "Tobi Adeyemi",
      email: "tobi@church.org",
      phone: "+234 800 000",
      role: "member",
    });
    expect(created).toMatchObject({ ok: true, member: { name: "Tobi Adeyemi", role: "member" } });
    expect(await createMember({ name: "Again", email: "TOBI@church.org", role: "member" })).toEqual(
      {
        ok: false,
        error: "EMAIL_TAKEN",
      },
    );
    expect((await listMembers("adey")).map((m) => m.email)).toEqual(["tobi@church.org"]);
    expect(await listMembers("800")).toHaveLength(1);
    expect(await listMembers("100%")).toEqual([]); // LIKE wildcards are escaped
  });

  it("deactivating ends their sessions; admins can't demote or deactivate themselves", async () => {
    const admin = await insertUser({ role: "admin" });
    const member = await insertUser();
    await getDb()
      .insert(session)
      .values({
        id: randomUUID(),
        userId: member.id,
        token: randomUUID(),
        expiresAt: new Date(now + DAY),
      });

    expect(await updateMember(member.id, { isActive: false }, admin.id)).toMatchObject({
      ok: true,
    });
    expect(await getDb().select().from(session)).toHaveLength(0);
    expect(await updateMember(admin.id, { isActive: false }, admin.id)).toEqual({
      ok: false,
      error: "SELF_CHANGE",
    });
    expect(await updateMember(admin.id, { role: "member" }, admin.id)).toEqual({
      ok: false,
      error: "SELF_CHANGE",
    });
    expect(await updateMember(randomUUID(), { name: "X" }, admin.id)).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("imports a CSV: creates new, skips existing and repeats, reports bad lines", async () => {
    await insertUser({ email: "existing@church.org" });
    const csv = [
      "Email,Name,Phone",
      "new1@church.org,New One,+234 1",
      "EXISTING@church.org,Old Person,",
      "new1@church.org,Repeat,",
      "not-an-email,Bad,",
      ",Missing Email,",
      '"new2@church.org","Okafor, Chiamaka",',
    ].join("\n");

    const result = await importMembersCsv(csv);
    expect(result.created).toBe(2);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      "repeated in this file",
      "already a member",
    ]);
    expect(result.errors.map((e) => e.line)).toEqual([5, 6]);
    expect((await listMembers("Chiamaka"))[0]?.name).toBe("Okafor, Chiamaka");
  });

  it("re-imports its own export (formula-guarded phone numbers included)", async () => {
    expect(
      await importMembersCsv("name,email,phone\nTobi,tobi@church.org,'+234 800 1"),
    ).toMatchObject({
      created: 1,
      errors: [],
    });
    expect((await listMembers("tobi"))[0]?.phone).toBe("+234 800 1");
  });

  it("refuses a CSV without name and email columns", async () => {
    expect((await importMembersCsv("first,last\nA,B")).errors[0]?.line).toBe(1);
  });

  it("history: attended, excused, absent and upcoming since joining", async () => {
    const member = await insertUser({ joinedAt: new Date(now - 30 * DAY) });
    const mk = (date: string, daysAgo: number, status: "processed" | "scheduled") =>
      insertSession(CHURCH, {
        serviceDate: date,
        startsAt: new Date(now - daysAgo * DAY),
        endsAt: new Date(now - daysAgo * DAY + 3_600_000),
        status,
      });
    await mk("2000-01-02", 60, "processed"); // before joining
    const here = await mk("2000-01-09", 21, "processed");
    const excused = await mk("2000-01-16", 14, "processed");
    await mk("2000-01-23", 7, "processed");
    await mk("2000-01-30", -7, "scheduled");
    await getDb()
      .insert(attendanceLogs)
      .values({ sessionId: here.id, userId: member.id, method: "auto_geofence" });
    const admin = await insertUser({ role: "admin" });
    await getDb()
      .update(serviceSessions)
      .set({ status: "closed" })
      .where(eq(serviceSessions.id, excused.id));
    expect(await addExcusal(excused.id, member.id, "Travel", admin.id)).toEqual({ ok: true });

    const history = await getMemberHistory(member.id);
    expect(history.map((h) => [h.serviceDate, h.outcome])).toEqual([
      ["2000-01-30", "upcoming"],
      ["2000-01-23", "absent"],
      ["2000-01-16", "excused"],
      ["2000-01-09", "attended"],
    ]);
  });

  it("exports attendance rows with a header", async () => {
    const member = await insertUser({ name: "Tobi" });
    const s = await insertSession(CHURCH, { serviceDate: "2026-10-18" });
    await getDb()
      .insert(attendanceLogs)
      .values({ sessionId: s.id, userId: member.id, method: "qr_scan" });
    const rows = await exportAttendanceRows();
    expect(rows[0]).toEqual(["service_date", "name", "email", "method", "checked_in_at"]);
    expect(rows[1]?.slice(0, 2)).toEqual(["2026-10-18", "Tobi"]);
  });
});

describe("excusals", () => {
  it("can't excuse someone already checked in, or change a processed session", async () => {
    const admin = await insertUser({ role: "admin" });
    const member = await insertUser();
    const open = await insertSession(CHURCH);
    await getDb()
      .insert(attendanceLogs)
      .values({ sessionId: open.id, userId: member.id, method: "qr_scan" });
    expect(await addExcusal(open.id, member.id, undefined, admin.id)).toEqual({
      ok: false,
      error: "ALREADY_CHECKED_IN",
    });

    const processed = await insertSession(CHURCH, {
      serviceDate: "2001-01-07",
      status: "processed",
    });
    expect(await addExcusal(processed.id, member.id, undefined, admin.id)).toEqual({
      ok: false,
      error: "SESSION_LOCKED",
    });
    expect(await removeExcusal(processed.id, member.id)).toEqual({
      ok: false,
      error: "SESSION_LOCKED",
    });
  });
});

describe("dashboard stats", () => {
  it("this Sunday counts check-ins against members who had joined; trend is oldest first", async () => {
    const joined = { joinedAt: new Date(now - 100 * DAY) };
    const [a, b] = [await insertUser(joined), await insertUser(joined)];
    await insertUser({ joinedAt: new Date(now) }); // joined after the session started: not expected
    const today = await insertSession(CHURCH); // open, around now
    await getDb()
      .insert(attendanceLogs)
      .values({ sessionId: today.id, userId: a.id, method: "qr_scan" });

    expect(await getThisSunday()).toMatchObject({ id: today.id, attended: 1, expected: 2 });

    const past = (date: string, weeks: number) =>
      insertSession(CHURCH, {
        serviceDate: date,
        startsAt: new Date(now - weeks * 7 * DAY),
        endsAt: new Date(now - weeks * 7 * DAY + 3_600_000),
        status: "processed",
      });
    const older = await past("2000-01-02", 2);
    await past("2000-01-09", 1);
    await getDb()
      .insert(attendanceLogs)
      .values({ sessionId: older.id, userId: b.id, method: "manual_admin" });
    expect(await getAttendanceTrend()).toEqual([
      { serviceDate: "2000-01-02", attended: 1, expected: 2 },
      { serviceDate: "2000-01-09", attended: 0, expected: 2 },
    ]);
  });
});
