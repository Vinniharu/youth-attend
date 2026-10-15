import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { type LatLng, pointSql } from "@/db/point";

export { pointSql, type LatLng };

// Lives in the client-safe schemas module; re-exported for server callers.
export { pointSchema } from "@/lib/schemas";

export type OpenSessionMatch = {
  sessionId: string;
  distanceM: number;
  inside: boolean;
  /** The session's geofence radius, in metres. */
  radiusM: number;
};

/**
 * Finds the open service session for `now` and measures the point against its
 * geofence. The server, never the client, decides "inside". Returns null when
 * no session is open.
 */
export async function findOpenSessionForPoint(
  db: NodePgDatabase,
  point: LatLng,
  now: Date = new Date(),
): Promise<OpenSessionMatch | null> {
  const p = pointSql(point);
  const result = await db.execute<{
    id: string;
    distance_m: number;
    inside: boolean;
    radius_m: number;
  }>(sql`
    SELECT
      s.id,
      s.radius_m,
      ST_Distance(s.center, ${p}) AS distance_m,
      ST_DWithin(s.center, ${p}, s.radius_m) AS inside
    FROM service_sessions s
    WHERE s.status = 'open'
      AND ${now.toISOString()}::timestamptz BETWEEN s.starts_at AND s.ends_at
    ORDER BY s.starts_at DESC
    LIMIT 1
  `);

  const row = result.rows[0];
  if (!row) return null;
  return {
    sessionId: row.id,
    distanceM: Number(row.distance_m),
    inside: row.inside,
    radiusM: Number(row.radius_m),
  };
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** The point `distanceM` metres from `origin` along `bearingDeg` (0 = north). */
export function destinationPoint(origin: LatLng, distanceM: number, bearingDeg: number): LatLng {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(origin.lat);
  const λ1 = toRad(origin.lng);

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));

  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}

/** Great-circle distance in metres (haversine). */
export function haversineM(a: LatLng, b: LatLng): number {
  const dφ = toRad(b.lat - a.lat);
  const dλ = toRad(b.lng - a.lng);
  const h =
    Math.sin(dφ / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
