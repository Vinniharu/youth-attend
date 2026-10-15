import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { attendanceLogs, serviceSessions } from "@/db/schema";
import { checkInWithQr, recordManualCheckIn } from "@/lib/checkin";
import { destinationPoint } from "@/lib/geo";
import { issueQrToken } from "@/lib/qr-token";

import { insertSession, insertUser, truncateAll } from "./helpers";

const CHURCH = { lat: 6.5244, lng: 3.3792 }; // insertSession: 100 m radius, open around now
const at = (distanceM: number, accuracy = 20) => ({
  ...destinationPoint(CHURCH, distanceM, 90),
  accuracy,
});

async function openSessionWithToken(now = new Date()) {
  const session = await insertSession(CHURCH);
  return { session, token: issueQrToken(session.id, session.qrSecret, now).token };
}

beforeEach(truncateAll);
afterAll(closeDb);

describe("checkInWithQr", () => {
  it("checks in with a fresh code inside the geofence", async () => {
    const user = await insertUser();
    const { session, token } = await openSessionWithToken();
    const result = await checkInWithQr(user.id, token, at(30), "test-agent");
    expect(result).toMatchObject({ ok: true, alreadyCheckedIn: false, method: "qr_scan" });
    const [row] = await getDb().select().from(attendanceLogs);
    expect(row).toMatchObject({
      sessionId: session.id,
      method: "qr_scan",
      userAgent: "test-agent",
    });
  });

  it("rejects a valid code scanned from outside the geofence (a forwarded photo)", async () => {
    const user = await insertUser();
    const { token } = await openSessionWithToken();
    const result = await checkInWithQr(user.id, token, at(5_000, 20), null);
    expect(result).toMatchObject({ ok: false, reason: "OUTSIDE_GEOFENCE", radiusM: 100 });
    expect(await getDb().select().from(attendanceLogs)).toHaveLength(0);
  });

  it("gives weak indoor GPS the benefit of its accuracy (the relaxed QR rule)", async () => {
    const user = await insertUser();
    const { token } = await openSessionWithToken();
    // 160 m from the centre with ±120 m: within 100 m + 120 m, and 120 ≤ 150.
    expect(await checkInWithQr(user.id, token, at(160, 120), null)).toMatchObject({
      ok: true,
      method: "qr_scan",
    });

    const other = await insertUser();
    // 160 m with ±40 m: outside 100 m + 40 m.
    expect(await checkInWithQr(other.id, token, at(160, 40), null)).toMatchObject({
      ok: false,
      reason: "OUTSIDE_GEOFENCE",
    });
  });

  it("still rejects very rough readings (over QR_MAX_ACCURACY_M)", async () => {
    const user = await insertUser();
    const { token } = await openSessionWithToken();
    expect(await checkInWithQr(user.id, token, at(10, 200), null)).toEqual({
      ok: false,
      reason: "LOW_ACCURACY",
      accuracyM: 200,
      maxAccuracyM: 150,
    });
  });

  it("rejects a screenshot after about 60 seconds", async () => {
    const user = await insertUser();
    const shownAt = new Date();
    const { token } = await openSessionWithToken(shownAt);
    const later = (s: number) => new Date(shownAt.getTime() + s * 1000);
    // Valid in its window and the next one, dead after two full windows.
    expect(await checkInWithQr(user.id, token, at(10), null, later(61))).toEqual({
      ok: false,
      reason: "EXPIRED_QR",
    });
    expect(await checkInWithQr(user.id, token, at(10), null, later(25))).toMatchObject({
      ok: true,
    });
  });

  it("rejects forged and malformed codes", async () => {
    const user = await insertUser();
    const { session, token } = await openSessionWithToken();
    const forged = issueQrToken(session.id, "not-the-secret").token;
    expect(await checkInWithQr(user.id, forged, at(10), null)).toEqual({
      ok: false,
      reason: "INVALID_QR",
    });
    expect(await checkInWithQr(user.id, "garbage", at(10), null)).toEqual({
      ok: false,
      reason: "INVALID_QR",
    });
    const unknownSession = token.replace(session.id, "00000000-0000-4000-8000-000000000000");
    expect(await checkInWithQr(user.id, unknownSession, at(10), null)).toEqual({
      ok: false,
      reason: "INVALID_QR",
    });
  });

  it("needs the code's own session to be open", async () => {
    const user = await insertUser();
    const { session, token } = await openSessionWithToken();
    await getDb()
      .update(serviceSessions)
      .set({ status: "closed" })
      .where(eq(serviceSessions.id, session.id));
    expect(await checkInWithQr(user.id, token, at(10), null)).toEqual({
      ok: false,
      reason: "NO_OPEN_SESSION",
    });
  });

  it("reports an earlier check-in (any method) instead of a second row", async () => {
    const user = await insertUser();
    const admin = await insertUser({ role: "admin" });
    const { session, token } = await openSessionWithToken();
    await recordManualCheckIn(admin.id, session.id, user.id);
    expect(await checkInWithQr(user.id, token, at(5_000), null)).toMatchObject({
      ok: true,
      alreadyCheckedIn: true,
      method: "manual_admin",
    });
  });
});

describe("recordManualCheckIn", () => {
  it("records the admin and no location", async () => {
    const [member, admin] = await Promise.all([insertUser(), insertUser({ role: "admin" })]);
    const session = await insertSession(CHURCH, { status: "closed" });
    expect(await recordManualCheckIn(admin.id, session.id, member.id)).toMatchObject({
      ok: true,
      alreadyCheckedIn: false,
      method: "manual_admin",
    });
    const [row] = await getDb().select().from(attendanceLogs);
    expect(row).toMatchObject({ recordedBy: admin.id, location: null, accuracyM: null });
  });

  it("refuses processed and cancelled sessions, unknown and inactive members", async () => {
    const admin = await insertUser({ role: "admin" });
    const member = await insertUser();
    const inactive = await insertUser({ isActive: false });
    const processed = await insertSession(CHURCH, { status: "processed" });
    const cancelled = await insertSession(CHURCH, {
      status: "cancelled",
      serviceDate: "2001-01-07",
    });
    const open = await insertSession(CHURCH, { serviceDate: "2001-01-14" });

    expect(await recordManualCheckIn(admin.id, processed.id, member.id)).toEqual({
      ok: false,
      error: "SESSION_LOCKED",
    });
    expect(await recordManualCheckIn(admin.id, cancelled.id, member.id)).toEqual({
      ok: false,
      error: "SESSION_LOCKED",
    });
    expect(await recordManualCheckIn(admin.id, open.id, inactive.id)).toEqual({
      ok: false,
      error: "MEMBER_NOT_FOUND",
    });
    expect(
      await recordManualCheckIn(admin.id, "00000000-0000-4000-8000-000000000000", member.id),
    ).toEqual({ ok: false, error: "SESSION_NOT_FOUND" });
  });
});
