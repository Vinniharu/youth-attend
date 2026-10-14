import { randomBytes, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { serviceSessions, users } from "@/db/schema";
import type { LatLng } from "@/lib/geo";

/** Empties every app table. Refuses to touch anything but a *_test database. */
export async function truncateAll() {
  const db = getDb();
  const { rows } = await db.execute<{ db: string }>(sql`SELECT current_database() AS db`);
  const name = rows[0]?.db ?? "";
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to truncate non-test database "${name}"`);
  }
  await db.execute(sql`
    TRUNCATE follow_ups, notifications_log, excusals, attendance_logs,
             service_sessions, church_locations, users
    RESTART IDENTITY CASCADE
  `);
}

export async function insertUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const id = randomUUID();
  const [user] = await getDb()
    .insert(users)
    .values({ id, name: "Test Member", email: `${id}@example.com`, ...overrides })
    .returning();
  return user!;
}

export async function insertSession(
  center: LatLng,
  overrides: Partial<typeof serviceSessions.$inferInsert> = {},
) {
  const now = Date.now();
  const [session] = await getDb()
    .insert(serviceSessions)
    .values({
      serviceDate: new Date(now).toISOString().slice(0, 10),
      startsAt: new Date(now - 60 * 60_000),
      endsAt: new Date(now + 60 * 60_000),
      center,
      radiusM: 100,
      qrSecret: randomBytes(32).toString("base64url"),
      status: "open",
      ...overrides,
    })
    .returning();
  return session!;
}
