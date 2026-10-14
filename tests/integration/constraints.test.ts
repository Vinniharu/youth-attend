import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { attendanceLogs, churchLocations, followUps, notificationsLog, users } from "@/db/schema";

import { insertSession, insertUser, truncateAll } from "./helpers";

const CHURCH = { lat: 6.5244, lng: 3.3792 };

beforeEach(truncateAll);
afterAll(closeDb);

/** Drizzle wraps driver errors; the Postgres error code lives on `cause`. */
async function pgErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  throw new Error("Expected the query to fail");
}

describe("database constraints", () => {
  it("allows only one check-in per member per session", async () => {
    const user = await insertUser();
    const session = await insertSession(CHURCH);
    const row = { sessionId: session.id, userId: user.id, method: "auto_geofence" as const };

    await getDb().insert(attendanceLogs).values(row);
    expect(await pgErrorCode(getDb().insert(attendanceLogs).values(row))).toBe("23505");

    // The check-in pipeline relies on ON CONFLICT DO NOTHING returning no row.
    const again = await getDb()
      .insert(attendanceLogs)
      .values(row)
      .onConflictDoNothing()
      .returning();
    expect(again).toHaveLength(0);
  });

  it("allows only one default church location", async () => {
    const loc = { name: "Hall", center: CHURCH, radiusM: 100, isDefault: true };
    await getDb().insert(churchLocations).values(loc);
    expect(await pgErrorCode(getDb().insert(churchLocations).values(loc))).toBe("23505");
  });

  it("rejects a geofence radius outside 20–2000 m", async () => {
    const insert = (radiusM: number) =>
      getDb().insert(churchLocations).values({ name: "Hall", center: CHURCH, radiusM });
    expect(await pgErrorCode(insert(10))).toBe("23514");
    expect(await pgErrorCode(insert(2001))).toBe("23514");
  });

  it("rejects a session that ends before it starts", async () => {
    const start = new Date();
    const code = await pgErrorCode(
      insertSession(CHURCH, { startsAt: start, endsAt: new Date(start.getTime() - 1) }),
    );
    expect(code).toBe("23514");
  });

  it("allows only one open follow-up per member", async () => {
    const user = await insertUser();
    await getDb().insert(followUps).values({ userId: user.id, streakAtOpen: 3 });
    expect(
      await pgErrorCode(getDb().insert(followUps).values({ userId: user.id, streakAtOpen: 4 })),
    ).toBe("23505");
  });

  it("logs each notification once, even without a session (no duplicate emails)", async () => {
    const user = await insertUser();
    const row = { userId: user.id, sessionId: null, type: "flagged_member" as const };
    await getDb().insert(notificationsLog).values(row);
    expect(await pgErrorCode(getDb().insert(notificationsLog).values(row))).toBe("23505");
  });

  it("treats emails case-insensitively", async () => {
    await insertUser({ email: "Tobi@Example.com" });
    expect(await pgErrorCode(insertUser({ email: "tobi@example.com" }))).toBe("23505");
    const found = await getDb().select().from(users);
    expect(found).toHaveLength(1);
  });
});
