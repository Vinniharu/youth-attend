import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb, getDb } from "@/db/client";
import {
  attendanceLogs,
  excusals,
  followUps,
  notificationsLog,
  serviceSessions,
  users,
} from "@/db/schema";
import { processAbsences } from "@/lib/absences";
import { createUpcomingSession, openAndCloseSessions, purgeOldLocations } from "@/lib/jobs";
import { saveDefaultLocation } from "@/lib/location";

import { insertSession, insertUser, truncateAll } from "./helpers";

const CHURCH = { lat: 6.5244, lng: 3.3792 };
const DAY = 86_400_000;
const now = Date.now();

/** A closed Sunday `weeksAgo` weeks back (unique date per call). */
async function closedSunday(weeksAgo: number) {
  const start = new Date(now - weeksAgo * 7 * DAY);
  return insertSession(CHURCH, {
    serviceDate: new Date(Date.UTC(2000, 0, 2 + 7 * (100 - weeksAgo))).toISOString().slice(0, 10),
    startsAt: start,
    endsAt: new Date(start.getTime() + 3 * 3_600_000),
    status: "closed",
  });
}

const joinedLongAgo = { joinedAt: new Date(now - 365 * DAY) };
const reload = async (id: string) =>
  (await getDb().select().from(users).where(eq(users.id, id)))[0]!;
const notifications = () => getDb().select().from(notificationsLog);

beforeEach(async () => {
  await truncateAll();
  vi.stubEnv("ABSENCE_FLAG_THRESHOLD", "3");
  vi.stubEnv("ADMIN_ALERT_EMAILS", "pastor@church.org");
  vi.stubEnv("BREVO_API_KEY", ""); // sending is skipped unless a test stubs Brevo
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(closeDb);

describe("processAbsences: each branch", () => {
  it("attended → streak resets to 0", async () => {
    const member = await insertUser({ ...joinedLongAgo, consecutiveAbsences: 2 });
    const session = await closedSunday(1);
    await getDb()
      .insert(attendanceLogs)
      .values({ sessionId: session.id, userId: member.id, method: "manual_admin" });

    const run = await processAbsences();
    expect(run.sessions[0]).toMatchObject({ attended: 1, absent: 0 });
    expect((await reload(member.id)).consecutiveAbsences).toBe(0);
    expect(await notifications()).toHaveLength(0);
  });

  it("excused → no change", async () => {
    const member = await insertUser({ ...joinedLongAgo, consecutiveAbsences: 2 });
    const session = await closedSunday(1);
    await getDb().insert(excusals).values({ sessionId: session.id, userId: member.id });

    const run = await processAbsences();
    expect(run.sessions[0]).toMatchObject({ excused: 1, absent: 0 });
    expect((await reload(member.id)).consecutiveAbsences).toBe(2);
  });

  it("absent → streak + 1 and a 'missed you' email, unless they opted out", async () => {
    const wantsEmail = await insertUser({ ...joinedLongAgo });
    const optedOut = await insertUser({ ...joinedLongAgo, emailNotifications: false });
    const session = await closedSunday(1);

    await processAbsences();
    expect((await reload(wantsEmail.id)).consecutiveAbsences).toBe(1);
    expect((await reload(optedOut.id)).consecutiveAbsences).toBe(1);
    const queued = await notifications();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      userId: wantsEmail.id,
      sessionId: session.id,
      type: "single_absence",
    });
  });

  it("absent reaching the threshold → flagged, follow-up opened, leaders alerted", async () => {
    const member = await insertUser({ ...joinedLongAgo, consecutiveAbsences: 2 });
    const session = await closedSunday(1);

    const run = await processAbsences();
    expect(run.sessions[0]?.newlyFlagged).toBe(1);
    const after = await reload(member.id);
    expect(after).toMatchObject({ consecutiveAbsences: 3, isFlagged: true });
    expect(after.flaggedAt).toBeInstanceOf(Date);
    const [followUp] = await getDb().select().from(followUps);
    expect(followUp).toMatchObject({ userId: member.id, streakAtOpen: 3, resolvedAt: null });
    expect((await notifications()).map((n) => n.type).sort()).toEqual([
      "flagged_member",
      "single_absence",
    ]);
    expect((await notifications()).every((n) => n.sessionId === session.id)).toBe(true);
  });

  it("already flagged → streak grows, but no second follow-up or alert", async () => {
    const member = await insertUser({
      ...joinedLongAgo,
      consecutiveAbsences: 3,
      isFlagged: true,
      flaggedAt: new Date(now - 7 * DAY),
    });
    await getDb().insert(followUps).values({ userId: member.id, streakAtOpen: 3 });
    await closedSunday(1);

    await processAbsences();
    expect((await reload(member.id)).consecutiveAbsences).toBe(4);
    expect(await getDb().select().from(followUps)).toHaveLength(1);
    expect((await notifications()).map((n) => n.type)).toEqual(["single_absence"]);
  });

  it("a flagged member who returns: streak 0, still flagged, follow-up stays open", async () => {
    const member = await insertUser({
      ...joinedLongAgo,
      consecutiveAbsences: 4,
      isFlagged: true,
      flaggedAt: new Date(now - 7 * DAY),
    });
    await getDb().insert(followUps).values({ userId: member.id, streakAtOpen: 3 });
    const session = await closedSunday(1);
    await getDb()
      .insert(attendanceLogs)
      .values({ sessionId: session.id, userId: member.id, method: "qr_scan" });

    await processAbsences();
    expect(await reload(member.id)).toMatchObject({ consecutiveAbsences: 0, isFlagged: true });
    expect((await getDb().select().from(followUps))[0]?.resolvedAt).toBeNull();
  });

  it("ignores admins, inactive members, and anyone who joined after the service", async () => {
    const admin = await insertUser({ ...joinedLongAgo, role: "admin" });
    const inactive = await insertUser({ ...joinedLongAgo, isActive: false });
    const newcomer = await insertUser({ joinedAt: new Date(now) });
    await closedSunday(1);

    const run = await processAbsences();
    expect(run.sessions[0]?.absent).toBe(0);
    for (const user of [admin, inactive, newcomer]) {
      expect((await reload(user.id)).consecutiveAbsences).toBe(0);
    }
  });

  it("skips open, scheduled and cancelled sessions entirely", async () => {
    const member = await insertUser({ ...joinedLongAgo });
    await insertSession(CHURCH, { status: "open", serviceDate: "2001-01-07" });
    await insertSession(CHURCH, { status: "scheduled", serviceDate: "2001-01-14" });
    await insertSession(CHURCH, { status: "cancelled", serviceDate: "2001-01-21" });

    const run = await processAbsences();
    expect(run.sessions).toEqual([]);
    expect((await reload(member.id)).consecutiveAbsences).toBe(0);
  });

  it("processes several closed Sundays oldest first, flagging on the third miss", async () => {
    const member = await insertUser({ ...joinedLongAgo });
    const [s3, s2, s1] = [await closedSunday(3), await closedSunday(2), await closedSunday(1)];

    const run = await processAbsences();
    expect(run.sessions.map((s) => s.sessionId)).toEqual([s3.id, s2.id, s1.id]);
    expect(await reload(member.id)).toMatchObject({ consecutiveAbsences: 3, isFlagged: true });
    const statuses = await getDb().select({ status: serviceSessions.status }).from(serviceSessions);
    expect(statuses.every((s) => s.status === "processed")).toBe(true);
  });
});

describe("processAbsences: idempotency", () => {
  it("running twice changes nothing the second time and sends no duplicates", async () => {
    const member = await insertUser({ ...joinedLongAgo, consecutiveAbsences: 2 });
    await closedSunday(1);
    const brevo = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messageVersions?: unknown[] };
      return body.messageVersions
        ? Response.json({ messageIds: body.messageVersions.map((_, i) => `<batch-${i}>`) })
        : Response.json({ messageId: "<alert>" });
    });
    vi.stubEnv("BREVO_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Youth Church <noreply@church.org>");
    vi.stubGlobal("fetch", brevo);

    const first = await processAbsences();
    expect(first.emails).toEqual({ sent: 2, failed: 0, skipped: 0 });
    const second = await processAbsences();
    expect(second).toEqual({ sessions: [], emails: { sent: 0, failed: 0, skipped: 0 } });

    expect(brevo).toHaveBeenCalledTimes(2); // one batch + one alert, ever
    expect((await reload(member.id)).consecutiveAbsences).toBe(3);
    expect(await getDb().select().from(followUps)).toHaveLength(1);
    const rows = await notifications();
    expect(rows.map((r) => r.status)).toEqual(["sent", "sent"]);
    expect(rows.find((r) => r.type === "single_absence")?.providerMessageId).toBe("<batch-0>");
  });
});

describe("sending", () => {
  it("batches 'missed you' emails with per-member params and a signed unsubscribe link", async () => {
    const tobi = await insertUser({ ...joinedLongAgo, name: "Tobi Adeyemi" });
    const ada = await insertUser({ ...joinedLongAgo, name: "Ada Okoro" });
    await closedSunday(1);
    const brevo = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messageVersions: unknown[] };
      return Response.json({ messageIds: body.messageVersions.map((_, i) => `<m${i}>`) });
    });
    vi.stubEnv("BREVO_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "noreply@church.org");
    vi.stubGlobal("fetch", brevo);

    await processAbsences();
    expect(brevo).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(brevo.mock.calls[0]![1].body)) as {
      htmlContent: string;
      messageVersions: { to: { email: string }[]; params: Record<string, string> }[];
    };
    expect(body.htmlContent).toContain("{{ params.firstName }}");
    const byEmail = new Map(body.messageVersions.map((v) => [v.to[0]!.email, v.params]));
    expect(byEmail.get(tobi.email)).toMatchObject({ firstName: "Tobi" });
    expect(byEmail.get(ada.email)).toMatchObject({ firstName: "Ada" });
    expect(byEmail.get(tobi.email)?.unsubscribeUrl).toMatch(
      new RegExp(`/unsubscribe\\?u=${tobi.id}&s=[A-Za-z0-9_-]{22}$`),
    );
  });

  it("records a failure, then retries it on the next run", async () => {
    await insertUser({ ...joinedLongAgo });
    await closedSunday(1);
    vi.stubEnv("BREVO_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "noreply@church.org");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ code: "unauthorized", message: "Key not found" }, { status: 401 }),
      ),
    );

    expect((await processAbsences()).emails).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect((await notifications())[0]).toMatchObject({ status: "failed" });
    expect((await notifications())[0]?.error).toContain("401");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ messageIds: ["<retry>"] })),
    );
    expect((await processAbsences()).emails).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect((await notifications())[0]).toMatchObject({
      status: "sent",
      providerMessageId: "<retry>",
    });
  });

  it("skips members who unsubscribed after the email was queued", async () => {
    const member = await insertUser({ ...joinedLongAgo });
    await closedSunday(1);
    await processAbsences(); // queued, skipped (no key in dev)
    await getDb()
      .update(notificationsLog)
      .set({ status: "pending" })
      .where(eq(notificationsLog.userId, member.id));
    await getDb().update(users).set({ emailNotifications: false }).where(eq(users.id, member.id));

    vi.stubEnv("BREVO_API_KEY", "test-key");
    const brevo = vi.fn();
    vi.stubGlobal("fetch", brevo);
    expect((await processAbsences()).emails).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(brevo).not.toHaveBeenCalled();
  });
});

describe("scheduled jobs", () => {
  it("open-close: opens scheduled sessions in their window and closes ended ones", async () => {
    const live = await insertSession(CHURCH, { status: "scheduled", serviceDate: "2001-01-07" });
    const ended = await insertSession(CHURCH, {
      status: "open",
      serviceDate: "2001-01-14",
      startsAt: new Date(now - 5 * 3_600_000),
      endsAt: new Date(now - 3_600_000),
    });
    const neverOpened = await insertSession(CHURCH, {
      status: "scheduled",
      serviceDate: "2001-01-21",
      startsAt: new Date(now - 5 * 3_600_000),
      endsAt: new Date(now - 3_600_000),
    });
    const adminClosed = await insertSession(CHURCH, {
      status: "closed",
      serviceDate: "2001-01-28",
    });

    expect(await openAndCloseSessions()).toEqual({ opened: 1, closed: 2 });
    const status = async (id: string) =>
      (await getDb().select().from(serviceSessions).where(eq(serviceSessions.id, id)))[0]!.status;
    expect(await status(live.id)).toBe("open");
    expect(await status(ended.id)).toBe("closed");
    expect(await status(neverOpened.id)).toBe("closed");
    expect(await status(adminClosed.id)).toBe("closed"); // never reopened
    expect(await openAndCloseSessions()).toEqual({ opened: 0, closed: 0 });
  });

  it("create-session: creates the upcoming Sunday once, and needs a geofence", async () => {
    expect(await createUpcomingSession()).toMatchObject({ created: false, reason: "NO_LOCATION" });
    await saveDefaultLocation({ name: "Main", center: CHURCH, radiusM: 100 });
    expect(await createUpcomingSession()).toMatchObject({ created: true });
    expect(await createUpcomingSession()).toMatchObject({
      created: false,
      reason: "SESSION_EXISTS",
    });
  });

  it("purge: wipes coordinates older than the retention period only", async () => {
    vi.stubEnv("LOCATION_RETENTION_DAYS", "90");
    const [a, b] = [await insertUser(), await insertUser()];
    const session = await insertSession(CHURCH);
    await getDb()
      .insert(attendanceLogs)
      .values([
        {
          sessionId: session.id,
          userId: a.id,
          method: "auto_geofence",
          location: CHURCH,
          accuracyM: 10,
          checkedInAt: new Date(now - 91 * DAY),
        },
        {
          sessionId: session.id,
          userId: b.id,
          method: "auto_geofence",
          location: CHURCH,
          accuracyM: 10,
        },
      ]);

    expect(await purgeOldLocations()).toMatchObject({ purged: 1 });
    const rows = await getDb().select().from(attendanceLogs);
    expect(rows.find((r) => r.userId === a.id)).toMatchObject({ location: null, accuracyM: null });
    expect(rows.find((r) => r.userId === b.id)?.location).not.toBeNull();
    expect(await purgeOldLocations()).toMatchObject({ purged: 0 });
  });
});
