import "server-only";

import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { churchLocations, type ChurchLocation } from "@/db/schema";
import type { LocationInput } from "@/lib/schemas";

/** The church's default geofence, or null before an admin has set one. */
export async function getDefaultLocation(): Promise<ChurchLocation | null> {
  const [row] = await getDb()
    .select()
    .from(churchLocations)
    .where(eq(churchLocations.isDefault, true))
    .limit(1);
  return row ?? null;
}

/**
 * Creates or replaces the default geofence in one statement (the partial unique
 * index `one_default_location` is the conflict target). Existing sessions keep
 * the copy they were created with.
 */
export async function saveDefaultLocation(input: LocationInput): Promise<ChurchLocation> {
  const values = { name: input.name, center: input.center, radiusM: input.radiusM };
  const [row] = await getDb()
    .insert(churchLocations)
    .values({ ...values, isDefault: true })
    .onConflictDoUpdate({
      target: churchLocations.isDefault,
      targetWhere: sql`${churchLocations.isDefault}`,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return row!;
}
