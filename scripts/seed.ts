/**
 * Seeds demo data: 1 admin, 20 members, the default church location and the
 * 3 most recent Sundays (already processed) with realistic attendance.
 * Deterministic (seeded RNG) and safe to re-run: it truncates app tables first,
 * all inside one transaction.
 *
 *   npm run db:seed
 */
import { randomBytes, randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { closeDb, getDb } from "@/db/client";
import {
  attendanceLogs,
  churchLocations,
  excusals,
  followUps,
  serviceSessions,
  users,
  type NewUser,
} from "@/db/schema";
import { appTimeZone, defaultServiceWindow } from "@/lib/config";
import { destinationPoint, type LatLng } from "@/lib/geo";
import { addDays, recentSundays, zonedDateTimeToUtc } from "@/lib/time";

import { assertLocalDatabase } from "./guard";

assertLocalDatabase("seed");

const TZ = appTimeZone();
const { start: START, end: END } = defaultServiceWindow();
const FLAG_THRESHOLD = Number(process.env.ABSENCE_FLAG_THRESHOLD ?? 3);
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";

// Placeholder church: set the real geofence on the admin map in Phase 3.
const CHURCH: LatLng = { lat: 6.5244, lng: 3.3792 };
const RADIUS_M = 120;

const MEMBER_NAMES = [
  "Tobi Adeyemi",
  "Chiamaka Okafor",
  "Daniel Eze",
  "Temi Bakare",
  "Ifeoluwa Ojo",
  "Emeka Nwosu",
  "Zainab Bello",
  "David Okonkwo",
  "Precious Udo",
  "Kemi Alabi",
  "Samuel Ibrahim",
  "Adaeze Obi",
  "Joshua Ogunleye",
  "Blessing Etim",
  "Femi Adebayo",
  "Ngozi Chukwu",
  "Michael Lawal",
  "Esther Akpan",
  "Victor Olawale",
  "Grace Nnamdi",
];

/** Small deterministic PRNG (mulberry32) so every seed run is identical. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`;

type Outcome = "attended" | "excused" | "absent";

// Scripted members (by index) so the dashboard always has known cases:
// 0 is flagged (3 straight misses), 1 is drifting (2 misses), 2 has an excusal.
const SCRIPTED: Record<number, Outcome[]> = {
  0: ["absent", "absent", "absent"],
  1: ["attended", "absent", "absent"],
  2: ["attended", "excused", "attended"],
};

async function main() {
  const random = rng(20261011);
  const sundays = recentSundays(3, TZ);
  const joinedAt = zonedDateTimeToUtc(addDays(sundays[0]!, -60), "10:00", TZ);

  const summary = await getDb().transaction(async (tx) => {
    await tx.execute(sql`
      TRUNCATE follow_ups, notifications_log, excusals, attendance_logs,
               service_sessions, church_locations, verification, users
      RESTART IDENTITY CASCADE
    `);

    // ---- people
    const admin: NewUser = {
      id: randomUUID(),
      name: "Ada Okoro",
      email: ADMIN_EMAIL,
      emailVerified: true,
      role: "admin",
      joinedAt,
    };
    const members = MEMBER_NAMES.map((name) => ({
      id: randomUUID(),
      name,
      email: emailFor(name),
      phone: `+23480${String(Math.floor(random() * 1e8)).padStart(8, "0")}`,
      joinedAt,
    }));
    await tx.insert(users).values([admin, ...members]);

    // ---- church + past Sundays
    await tx
      .insert(churchLocations)
      .values({ name: "Main Auditorium", center: CHURCH, radiusM: RADIUS_M, isDefault: true });

    const sessions = await tx
      .insert(serviceSessions)
      .values(
        sundays.map((date) => ({
          serviceDate: date,
          startsAt: zonedDateTimeToUtc(date, START, TZ),
          endsAt: zonedDateTimeToUtc(date, END, TZ),
          center: CHURCH,
          radiusM: RADIUS_M,
          qrSecret: randomBytes(32).toString("base64url"),
          status: "processed" as const,
          absencesProcessedAt: zonedDateTimeToUtc(date, "21:00", TZ),
        })),
      )
      .returning({ id: serviceSessions.id, startsAt: serviceSessions.startsAt });

    // ---- outcomes per member per Sunday (oldest first)
    const outcomes = members.map(
      (_, i) =>
        SCRIPTED[i] ??
        sessions.map((): Outcome => {
          const r = random();
          return r < 0.78 ? "attended" : r < 0.83 ? "excused" : "absent";
        }),
    );

    const methods = ["auto_geofence", "auto_geofence", "auto_geofence", "qr_scan"] as const;
    const attendanceRows: (typeof attendanceLogs.$inferInsert)[] = [];
    const excusalRows: (typeof excusals.$inferInsert)[] = [];

    members.forEach((member, m) => {
      sessions.forEach((session, s) => {
        const outcome = outcomes[m]![s]!;
        if (outcome === "excused") {
          excusalRows.push({
            sessionId: session.id,
            userId: member.id,
            reason: "Travelling with family",
            createdBy: admin.id,
          });
          return;
        }
        if (outcome !== "attended") return;

        const checkedInAt = new Date(session.startsAt.getTime() + random() * 75 * 60_000);
        if (random() < 0.08) {
          attendanceRows.push({
            sessionId: session.id,
            userId: member.id,
            checkedInAt,
            method: "manual_admin",
            recordedBy: admin.id,
          });
          return;
        }
        attendanceRows.push({
          sessionId: session.id,
          userId: member.id,
          checkedInAt,
          method: methods[Math.floor(random() * methods.length)]!,
          location: destinationPoint(CHURCH, random() * RADIUS_M * 0.8, random() * 360),
          accuracyM: Math.round(8 + random() * 40),
          userAgent: "seed",
        });
      });
    });

    await tx.insert(attendanceLogs).values(attendanceRows);
    if (excusalRows.length) await tx.insert(excusals).values(excusalRows);

    // Distances exactly as the server measures them (PostGIS spheroid).
    await tx.execute(sql`
      UPDATE attendance_logs a
      SET distance_m = round(ST_Distance(a.location, s.center)::numeric, 1)
      FROM service_sessions s
      WHERE s.id = a.session_id AND a.location IS NOT NULL
    `);

    // ---- streaks: walk each member's history the way the absence engine will
    const flagged: (typeof followUps.$inferInsert)[] = [];
    for (const [m, member] of members.entries()) {
      let streak = 0;
      let flaggedAt: Date | null = null;
      outcomes[m]!.forEach((outcome, s) => {
        if (outcome === "attended") streak = 0;
        else if (outcome === "absent") {
          streak += 1;
          if (streak >= FLAG_THRESHOLD && !flaggedAt) flaggedAt = sessions[s]!.startsAt;
        }
      });

      await tx
        .update(users)
        .set({ consecutiveAbsences: streak, isFlagged: flaggedAt !== null, flaggedAt })
        .where(eq(users.id, member.id));
      if (flaggedAt) flagged.push({ userId: member.id, streakAtOpen: streak, openedAt: flaggedAt });
    }
    if (flagged.length) await tx.insert(followUps).values(flagged);

    return {
      members: members.length,
      sessions: sessions.length,
      checkins: attendanceRows.length,
      excusals: excusalRows.length,
      flagged: flagged.length,
    };
  });

  console.log(
    `[seed] 1 admin (${ADMIN_EMAIL}), ${summary.members} members, ${summary.sessions} Sundays ` +
      `(${sundays.join(", ")}), ${summary.checkins} check-ins, ${summary.excusals} excusals, ` +
      `${summary.flagged} flagged`,
  );
}

main()
  .catch((error) => {
    console.error("[seed] failed", error);
    process.exitCode = 1;
  })
  .finally(closeDb);
