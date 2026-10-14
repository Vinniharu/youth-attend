import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { attendanceLogs, churchLocations, excusals, serviceSessions } from "@/db/schema";
import { getDefaultLocation, saveDefaultLocation } from "@/lib/location";
import { createSession, listSessions, SessionError, updateSession } from "@/lib/sessions";

import { insertUser, truncateAll } from "./helpers";

const TZ = "Africa/Lagos";
const CHURCH = { name: "Main Auditorium", center: { lat: 6.5244, lng: 3.3792 }, radiusM: 120 };
const SUNDAY = { serviceDate: "2026-10-18", start: "08:00", end: "11:30" };

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (error: unknown) => (error instanceof SessionError ? error.code : String(error)),
  );

beforeEach(truncateAll);
afterAll(closeDb);

describe("default geofence", () => {
  it("saves and reloads exactly", async () => {
    expect(await getDefaultLocation()).toBeNull();
    await saveDefaultLocation(CHURCH);
    const loaded = await getDefaultLocation();
    expect(loaded).toMatchObject({ name: CHURCH.name, radiusM: 120, isDefault: true });
    expect(loaded!.center.lat).toBeCloseTo(CHURCH.center.lat, 9);
    expect(loaded!.center.lng).toBeCloseTo(CHURCH.center.lng, 9);
  });

  it("updates in place: there is only ever one default row", async () => {
    const first = await saveDefaultLocation(CHURCH);
    const moved = await saveDefaultLocation({
      name: "Youth Hall",
      center: { lat: 6.6, lng: 3.35 },
      radiusM: 200,
    });
    expect(moved.id).toBe(first.id);
    const rows = await getDb().select().from(churchLocations);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Youth Hall", radiusM: 200 });
  });
});

describe("createSession", () => {
  it("needs a geofence first", async () => {
    expect(await code(createSession(SUNDAY, TZ))).toBe("NO_LOCATION");
  });

  it("copies the geofence and converts the window from church time", async () => {
    await saveDefaultLocation(CHURCH);
    const session = await createSession(SUNDAY, TZ);
    expect(session).toMatchObject({ serviceDate: "2026-10-18", radiusM: 120, status: "scheduled" });
    expect(session.center.lat).toBeCloseTo(CHURCH.center.lat, 9);
    expect(session.startsAt.toISOString()).toBe("2026-10-18T07:00:00.000Z");
    expect(session.endsAt.toISOString()).toBe("2026-10-18T10:30:00.000Z");
    expect(session).not.toHaveProperty("qrSecret");

    const [row] = await getDb()
      .select({ qrSecret: serviceSessions.qrSecret })
      .from(serviceSessions)
      .where(eq(serviceSessions.id, session.id));
    expect(Buffer.from(row!.qrSecret, "base64url")).toHaveLength(32);
  });

  it("keeps each session's copy when the geofence moves later", async () => {
    await saveDefaultLocation(CHURCH);
    const before = await createSession(SUNDAY, TZ);
    await saveDefaultLocation({ ...CHURCH, center: { lat: 6.7, lng: 3.4 }, radiusM: 300 });
    const after = await createSession({ ...SUNDAY, serviceDate: "2026-10-25" }, TZ);

    const [old] = await getDb()
      .select()
      .from(serviceSessions)
      .where(eq(serviceSessions.id, before.id));
    expect(old!.radiusM).toBe(120);
    expect(old!.center.lat).toBeCloseTo(6.5244, 9);
    expect(after.radiusM).toBe(300);
    expect(after.center.lat).toBeCloseTo(6.7, 9);
  });

  it("allows one session per date", async () => {
    await saveDefaultLocation(CHURCH);
    await createSession(SUNDAY, TZ);
    expect(await code(createSession(SUNDAY, TZ))).toBe("SESSION_EXISTS");
  });
});

describe("updateSession", () => {
  async function scheduled() {
    await saveDefaultLocation(CHURCH);
    return createSession(SUNDAY, TZ);
  }

  it("moves the window on the session's own date", async () => {
    const s = await scheduled();
    const updated = await updateSession(s.id, { window: { start: "09:15", end: "12:00" } }, TZ);
    expect(updated.startsAt.toISOString()).toBe("2026-10-18T08:15:00.000Z");
    expect(updated.endsAt.toISOString()).toBe("2026-10-18T11:00:00.000Z");
  });

  it("follows scheduled → open → closed → open, and allows cancelling", async () => {
    const s = await scheduled();
    expect((await updateSession(s.id, { status: "open" }, TZ)).status).toBe("open");
    expect((await updateSession(s.id, { status: "closed" }, TZ)).status).toBe("closed");
    expect((await updateSession(s.id, { status: "open" }, TZ)).status).toBe("open");
    expect((await updateSession(s.id, { status: "cancelled" }, TZ)).status).toBe("cancelled");
  });

  it("rejects transitions that skip a step", async () => {
    const s = await scheduled();
    expect(await code(updateSession(s.id, { status: "closed" }, TZ))).toBe("INVALID_TRANSITION");
  });

  it("restores a cancelled session, but not its times until restored", async () => {
    const s = await scheduled();
    await updateSession(s.id, { status: "cancelled" }, TZ);
    expect(await code(updateSession(s.id, { status: "open" }, TZ))).toBe("INVALID_TRANSITION");
    expect(await code(updateSession(s.id, { window: { start: "09:00", end: "10:00" } }, TZ))).toBe(
      "LOCKED",
    );
    expect((await updateSession(s.id, { status: "scheduled" }, TZ)).status).toBe("scheduled");
  });

  it("locks processed sessions", async () => {
    const s = await scheduled();
    await getDb()
      .update(serviceSessions)
      .set({ status: "processed" })
      .where(eq(serviceSessions.id, s.id));
    expect(await code(updateSession(s.id, { status: "cancelled" }, TZ))).toBe("LOCKED");
    expect(await code(updateSession(s.id, { window: { start: "09:00", end: "10:00" } }, TZ))).toBe(
      "LOCKED",
    );
  });

  it("reports a missing session", async () => {
    expect(
      await code(updateSession("00000000-0000-4000-8000-000000000000", { status: "open" }, TZ)),
    ).toBe("NOT_FOUND");
  });
});

describe("listSessions", () => {
  it("splits upcoming (soonest first) from past (newest first) with counts", async () => {
    await saveDefaultLocation(CHURCH);
    const dates = ["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"];
    const [oct4, oct11, oct18, oct25] = await Promise.all(
      dates.map((serviceDate) => createSession({ ...SUNDAY, serviceDate }, TZ)),
    );
    const [a, b, c] = await Promise.all([insertUser(), insertUser(), insertUser()]);
    await getDb()
      .insert(attendanceLogs)
      .values([
        { sessionId: oct11!.id, userId: a.id, method: "manual_admin" },
        { sessionId: oct11!.id, userId: b.id, method: "manual_admin" },
      ]);
    await getDb().insert(excusals).values({ sessionId: oct11!.id, userId: c.id });

    const { upcoming, past } = await listSessions("2026-10-14");
    expect(upcoming.map((s) => s.id)).toEqual([oct18!.id, oct25!.id]);
    expect(past.map((s) => s.id)).toEqual([oct11!.id, oct4!.id]);
    expect(past[0]).toMatchObject({ attended: 2, excused: 1 });
    expect(past[1]).toMatchObject({ attended: 0, excused: 0 });
    expect(upcoming[0]).not.toHaveProperty("qrSecret");
  });

  it("loads every upcoming session even when many are planned ahead", async () => {
    await saveDefaultLocation(CHURCH);
    for (let week = 0; week < 30; week++) {
      const date = new Date(Date.UTC(2026, 9, 18 + week * 7)).toISOString().slice(0, 10);
      await createSession({ ...SUNDAY, serviceDate: date }, TZ);
    }
    await createSession({ ...SUNDAY, serviceDate: "2026-10-11" }, TZ);
    const { upcoming, past } = await listSessions("2026-10-14");
    expect(upcoming).toHaveLength(30);
    expect(past).toHaveLength(1);
  });
});
