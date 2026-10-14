import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { churchLocations } from "@/db/schema";
import { destinationPoint, findOpenSessionForPoint, type LatLng } from "@/lib/geo";

import { insertSession, truncateAll } from "./helpers";

const CHURCH: LatLng = { lat: 6.5244, lng: 3.3792 };

beforeEach(truncateAll);
afterAll(closeDb);

describe("findOpenSessionForPoint (PostGIS)", () => {
  it.each([0, 90, 180, 270])(
    "100 m radius: 99 m is inside, 101 m outside (bearing %i°)",
    async (bearing) => {
      const session = await insertSession(CHURCH, { radiusM: 100 });

      const near = await findOpenSessionForPoint(getDb(), destinationPoint(CHURCH, 99, bearing));
      expect(near).toMatchObject({ sessionId: session.id, inside: true });
      expect(near!.distanceM).toBeGreaterThan(98);
      expect(near!.distanceM).toBeLessThan(100);

      const far = await findOpenSessionForPoint(getDb(), destinationPoint(CHURCH, 101, bearing));
      expect(far).toMatchObject({ sessionId: session.id, inside: false });
      expect(far!.distanceM).toBeGreaterThan(100);
    },
  );

  it("treats lat/lng as lat/lng: a swapped point is hundreds of km away", async () => {
    await insertSession(CHURCH);
    const swapped = { lat: CHURCH.lng, lng: CHURCH.lat };

    const match = await findOpenSessionForPoint(getDb(), swapped);
    expect(match!.inside).toBe(false);
    expect(match!.distanceM).toBeGreaterThan(100_000);
  });

  it("returns null when the only session is closed", async () => {
    await insertSession(CHURCH, { status: "closed" });
    expect(await findOpenSessionForPoint(getDb(), CHURCH)).toBeNull();
  });

  it("returns null outside the session's time window", async () => {
    await insertSession(CHURCH);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
    expect(await findOpenSessionForPoint(getDb(), CHURCH, tomorrow)).toBeNull();
  });

  it("round-trips geography points through the custom column type", async () => {
    const [row] = await getDb()
      .insert(churchLocations)
      .values({ name: "Hall", center: CHURCH, radiusM: 50 })
      .returning();

    const [read] = await getDb()
      .select()
      .from(churchLocations)
      .where(eq(churchLocations.id, row!.id));
    expect(read!.center.lat).toBeCloseTo(CHURCH.lat, 9);
    expect(read!.center.lng).toBeCloseTo(CHURCH.lng, 9);
  });
});
