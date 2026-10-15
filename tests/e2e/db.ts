import { createHash, randomBytes, randomUUID } from "node:crypto";

import pg from "pg";

/** The E2E database: DATABASE_URL with `_e2e` on the name. Never the dev data. */
export function e2eDatabaseUrl(base = process.env.DATABASE_URL): string {
  const url = new URL(base ?? "postgres://church@localhost:5432/attendance");
  url.pathname = `/${url.pathname.replace(/^\//, "").replace(/_e2e$/, "")}_e2e`;
  return url.toString();
}

export const CHURCH = { lat: 6.5244, lng: 3.3792 };
export const RADIUS_M = 100;

let pool: pg.Pool | undefined;
const db = () => (pool ??= new pg.Pool({ connectionString: e2eDatabaseUrl(), max: 2 }));

export async function closeE2eDb() {
  await pool?.end();
  pool = undefined;
}

async function assertE2eDatabase() {
  const { rows } = await db().query<{ name: string }>("SELECT current_database() AS name");
  if (!rows[0]?.name.endsWith("_e2e")) throw new Error(`Refusing to reset ${rows[0]?.name}`);
}

/** Empties the app tables and creates the church geofence plus one open session around now. */
export async function resetE2eData() {
  await assertE2eDatabase();
  await db().query(`
    TRUNCATE follow_ups, notifications_log, excusals, attendance_logs, service_sessions,
             church_locations, verification, users RESTART IDENTITY CASCADE`);
  const point = `ST_SetSRID(ST_MakePoint(${CHURCH.lng}, ${CHURCH.lat}), 4326)::geography`;
  await db().query(
    `INSERT INTO church_locations (name, center, radius_m, is_default) VALUES ('Main Auditorium', ${point}, $1, true)`,
    [RADIUS_M],
  );
  const now = Date.now();
  await db().query(
    `INSERT INTO service_sessions (service_date, starts_at, ends_at, center, radius_m, qr_secret, status)
     VALUES ($1, $2, $3, ${point}, $4, $5, 'open')`,
    [
      new Date(now).toISOString().slice(0, 10),
      new Date(now - 60 * 60_000),
      new Date(now + 3 * 60 * 60_000),
      RADIUS_M,
      randomBytes(32).toString("base64url"),
    ],
  );
}

export async function setSessionStatus(status: "open" | "scheduled") {
  await db().query("UPDATE service_sessions SET status = $1", [status]);
}

export async function createMember(
  email: string,
  name = "Test Member",
  role: "member" | "admin" = "member",
) {
  await db().query(
    "INSERT INTO users (id, name, email, email_verified, role) VALUES ($1, $2, $3, true, $4) ON CONFLICT (email) DO NOTHING",
    [randomUUID(), name, email, role],
  );
}

/** The id of the open session resetE2eData created. */
export async function openSessionId(): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    "SELECT id FROM service_sessions WHERE status = 'open' LIMIT 1",
  );
  return rows[0]!.id;
}

/**
 * Replaces the member's pending sign-in code with `otp`, stored the way Better Auth
 * 1.7 stores hashed codes (unsalted SHA-256, base64url; `:0` attempts). Lets tests
 * sign in through the real UI without reading email. Tied to Better Auth's format.
 */
export async function plantSignInCode(email: string, otp: string) {
  const identifier = `sign-in-otp-${email}`;
  const hash = createHash("sha256").update(otp).digest("base64url");
  await db().query("DELETE FROM verification WHERE identifier = $1", [identifier]);
  await db().query(
    "INSERT INTO verification (id, identifier, value, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')",
    [randomUUID(), identifier, `${hash}:0`],
  );
}

export async function attendanceCount(email: string): Promise<number> {
  const { rows } = await db().query<{ n: string }>(
    "SELECT count(*) AS n FROM attendance_logs a JOIN users u ON u.id = a.user_id WHERE u.email = $1",
    [email],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Yesterday's service, still open (as if nobody closed it yet): for the admin workflow. */
export async function createYesterdaysSession(): Promise<string> {
  const point = `ST_SetSRID(ST_MakePoint(${CHURCH.lng}, ${CHURCH.lat}), 4326)::geography`;
  const start = Date.now() - 24 * 60 * 60_000;
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO service_sessions (service_date, starts_at, ends_at, center, radius_m, qr_secret, status)
     VALUES ($1, $2, $3, ${point}, $4, $5, 'open') RETURNING id`,
    [
      new Date(start).toISOString().slice(0, 10),
      new Date(start),
      new Date(start + 3 * 60 * 60_000),
      RADIUS_M,
      randomBytes(32).toString("base64url"),
    ],
  );
  return rows[0]!.id;
}

/** Gives a member a run of missed Sundays and an earlier join date (test setup). */
export async function setHistory(email: string, streak: number) {
  await db().query(
    "UPDATE users SET consecutive_absences = $2, joined_at = now() - interval '60 days' WHERE email = $1",
    [email, streak],
  );
}

export async function userState(email: string) {
  const { rows } = await db().query<{
    consecutive_absences: number;
    is_flagged: boolean;
    open_follow_ups: string;
  }>(
    `SELECT u.consecutive_absences, u.is_flagged,
            (SELECT count(*) FROM follow_ups f WHERE f.user_id = u.id AND f.resolved_at IS NULL) AS open_follow_ups
     FROM users u WHERE u.email = $1`,
    [email],
  );
  return rows[0];
}
