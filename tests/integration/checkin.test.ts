import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { attendanceLogs, excusals, serviceSessions } from "@/db/schema";
import { checkInWithGeofence } from "@/lib/checkin";
import { destinationPoint } from "@/lib/geo";
import { getMemberStatus, getRecentSundays } from "@/lib/member-status";

import { insertSession, insertUser, truncateAll } from "./helpers";

const CHURCH = { lat: 6.5244, lng: 3.3792 }; // insertSession uses a 100 m radius
const at = (distanceM: number, accuracy = 20) => ({
  ...destinationPoint(CHURCH, distanceM, 45),
  accuracy,
});

beforeEach(truncateAll);
afterAll(closeDb);

describe("checkInWithGeofence", () => {
  it("checks in a member inside the geofence and stores the reading", async () => {
    const user = await insertUser();
    const session = await insertSession(CHURCH);
    const result = await checkInWithGeofence(user.id, at(40), "Mozilla/5.0 test");

    expect(result).toMatchObject({ ok: true, alreadyCheckedIn: false, method: "auto_geofence" });
    const [row] = await getDb()
      .select()
      .from(attendanceLogs)
      .where(eq(attendanceLogs.userId, user.id));
    expect(row).toMatchObject({
      sessionId: session.id,
      accuracyM: 20,
      userAgent: "Mozilla/5.0 test",
    });
    expect(row!.distanceM).toBeCloseTo(40, 0);
    expect(row!.location!.lat).toBeCloseTo(at(40).lat, 9);
  });

  it("reports already-checked-in on a second attempt, even from far away", async () => {
    const user = await insertUser();
    await insertSession(CHURCH);
    const first = await checkInWithGeofence(user.id, at(10), null);
    const again = await checkInWithGeofence(user.id, at(5_000, 500), null);

    expect(again).toMatchObject({ ok: true, alreadyCheckedIn: true });
    expect(first.ok && again.ok && again.checkedInAt).toBe(first.ok && first.checkedInAt);
    expect(await getDb().select().from(attendanceLogs)).toHaveLength(1);
  });

  it("rejects a point outside the radius with the distance", async () => {
    const user = await insertUser();
    await insertSession(CHURCH);
    const result = await checkInWithGeofence(user.id, at(340), null);
    // The test point is placed on a sphere; PostGIS measures on the spheroid.
    expect(result).toMatchObject({ ok: false, reason: "OUTSIDE_GEOFENCE", radiusM: 100 });
    const distanceM = result.ok || result.reason !== "OUTSIDE_GEOFENCE" ? 0 : result.distanceM;
    expect(distanceM).toBeGreaterThanOrEqual(338);
    expect(distanceM).toBeLessThanOrEqual(342);
    expect(await getDb().select().from(attendanceLogs)).toHaveLength(0);
  });

  it("rejects a reading worse than MAX_ACCURACY_M, even inside", async () => {
    const user = await insertUser();
    await insertSession(CHURCH);
    const result = await checkInWithGeofence(user.id, at(10, 140), null);
    expect(result).toEqual({ ok: false, reason: "LOW_ACCURACY", accuracyM: 140, maxAccuracyM: 75 });
  });

  it("reports no open session when none is open or the window has passed", async () => {
    const user = await insertUser();
    const session = await insertSession(CHURCH, { status: "scheduled" });
    expect(await checkInWithGeofence(user.id, at(10), null)).toEqual({
      ok: false,
      reason: "NO_OPEN_SESSION",
    });

    await getDb()
      .update(serviceSessions)
      .set({ status: "open" })
      .where(eq(serviceSessions.id, session.id));
    const afterWindow = new Date(Date.now() + 2 * 60 * 60_000);
    expect(await checkInWithGeofence(user.id, at(10), null, afterWindow)).toEqual({
      ok: false,
      reason: "NO_OPEN_SESSION",
    });
  });

  it("records each of two parallel attempts at most once", async () => {
    const user = await insertUser();
    await insertSession(CHURCH);
    const results = await Promise.all([
      checkInWithGeofence(user.id, at(10), null),
      checkInWithGeofence(user.id, at(12), null),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && !r.alreadyCheckedIn)).toHaveLength(1);
    expect(await getDb().select().from(attendanceLogs)).toHaveLength(1);
  });
});

describe("getMemberStatus", () => {
  it("returns the open session with my check-in", async () => {
    const user = await insertUser();
    const session = await insertSession(CHURCH);
    expect((await getMemberStatus(user.id)).current).toMatchObject({
      id: session.id,
      checkIn: null,
    });

    await checkInWithGeofence(user.id, at(10), null);
    const status = await getMemberStatus(user.id);
    expect(status.current?.checkIn?.method).toBe("auto_geofence");
    expect(status.next).toBeNull();
  });

  it("returns the next session when nothing is open", async () => {
    const user = await insertUser();
    const now = Date.now();
    const later = await insertSession(CHURCH, {
      serviceDate: "2099-01-04",
      startsAt: new Date(now + 3 * 86_400_000),
      endsAt: new Date(now + 3 * 86_400_000 + 3_600_000),
      status: "scheduled",
    });
    await insertSession(CHURCH, {
      serviceDate: "2099-01-11",
      startsAt: new Date(now + 10 * 86_400_000),
      endsAt: new Date(now + 10 * 86_400_000 + 3_600_000),
      status: "scheduled",
    });
    const status = await getMemberStatus(user.id);
    expect(status.current).toBeNull();
    expect(status.next?.id).toBe(later.id);
  });
});

describe("getRecentSundays", () => {
  it("is oldest first, skips excused and pre-joining Sundays", async () => {
    const day = 86_400_000;
    const now = Date.now();
    const user = await insertUser({ joinedAt: new Date(now - 30 * day) });
    const mk = (daysAgo: number, date: string) =>
      insertSession(CHURCH, {
        serviceDate: date,
        startsAt: new Date(now - daysAgo * day),
        endsAt: new Date(now - daysAgo * day + 3_600_000),
        status: "processed",
      });
    await mk(40, "2000-01-02"); // before joining: ignored
    const s21 = await mk(21, "2000-01-09");
    const s14 = await mk(14, "2000-01-16");
    await mk(7, "2000-01-23");
    await getDb()
      .insert(attendanceLogs)
      .values({ sessionId: s21.id, userId: user.id, method: "manual_admin" });
    await getDb().insert(excusals).values({ sessionId: s14.id, userId: user.id });

    expect(await getRecentSundays(user.id)).toEqual({ beats: [true, false], attended: 1 });
  });
});
