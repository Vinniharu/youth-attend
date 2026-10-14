import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { citext, geographyPoint } from "./types";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------- enums

export const userRole = pgEnum("user_role", ["member", "admin"]);
export const checkinMethod = pgEnum("checkin_method", ["auto_geofence", "qr_scan", "manual_admin"]);
export const sessionStatus = pgEnum("session_status", [
  "scheduled",
  "open",
  "closed",
  "processed",
  "cancelled",
]);
export const notifType = pgEnum("notif_type", ["single_absence", "flagged_member"]);

// ---------------------------------------------------------------- tables

/** Better Auth's user model (renamed to `users`) plus app fields. IDs are UUIDs from the app. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: citext("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  phone: text("phone"),
  role: userRole("role").notNull().default("member"),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  consecutiveAbsences: integer("consecutive_absences").notNull().default(0),
  isFlagged: boolean("is_flagged").notNull().default(false),
  flaggedAt: timestamptz("flagged_at"),
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamptz("joined_at").notNull().defaultNow(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const churchLocations = pgTable(
  "church_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    center: geographyPoint("center").notNull(),
    radiusM: integer("radius_m").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("church_locations_radius_m_check", sql`${t.radiusM} BETWEEN 20 AND 2000`),
    uniqueIndex("one_default_location")
      .on(t.isDefault)
      .where(sql`${t.isDefault}`),
  ],
);

export const serviceSessions = pgTable(
  "service_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceDate: date("service_date").notNull().unique(),
    startsAt: timestamptz("starts_at").notNull(),
    endsAt: timestamptz("ends_at").notNull(),
    /** Copied from church_locations when the session is created. */
    center: geographyPoint("center").notNull(),
    radiusM: integer("radius_m").notNull(),
    /** 32 random bytes, base64url. Never sent to members. */
    qrSecret: text("qr_secret").notNull(),
    status: sessionStatus("status").notNull().default("scheduled"),
    absencesProcessedAt: timestamptz("absences_processed_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("service_sessions_window_check", sql`${t.endsAt} > ${t.startsAt}`),
    index("service_sessions_center_gix").using("gist", t.center),
  ],
);

export const attendanceLogs = pgTable(
  "attendance_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => serviceSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    checkedInAt: timestamptz("checked_in_at").notNull().defaultNow(),
    method: checkinMethod("method").notNull(),
    /** Null for manual check-ins; purged after LOCATION_RETENTION_DAYS. */
    location: geographyPoint("location"),
    accuracyM: real("accuracy_m"),
    distanceM: real("distance_m"),
    userAgent: text("user_agent"),
    /** The admin who recorded a manual check-in. */
    recordedBy: uuid("recorded_by").references(() => users.id),
  },
  (t) => [unique("attendance_logs_session_user_key").on(t.sessionId, t.userId)],
);

export const excusals = pgTable(
  "excusals",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => serviceSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] })],
);

export const notificationsLog = pgTable(
  "notifications_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => serviceSessions.id, {
      onDelete: "set null",
    }),
    type: notifType("type").notNull(),
    /** The email provider's message id (Brevo `messageId`). */
    providerMessageId: text("provider_message_id"),
    /** pending | sent | failed | skipped */
    status: text("status").notNull().default("pending"),
    error: text("error"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  // NULLS NOT DISTINCT: a retried job must not log (user, NULL, type) twice.
  (t) => [
    unique("notifications_log_user_session_type_key")
      .on(t.userId, t.sessionId, t.type)
      .nullsNotDistinct(),
  ],
);

export const followUps = pgTable(
  "follow_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    openedAt: timestamptz("opened_at").notNull().defaultNow(),
    streakAtOpen: integer("streak_at_open").notNull(),
    assignedTo: uuid("assigned_to").references(() => users.id),
    notes: text("notes"),
    resolvedAt: timestamptz("resolved_at"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("one_open_follow_up")
      .on(t.userId)
      .where(sql`${t.resolvedAt} IS NULL`),
  ],
);

// ---------------------------------------------------------------- Better Auth
// Hand-written to match Better Auth 1.7's core tables (session, account,
// verification), with UUID ids and snake_case columns. TS keys must stay the
// Better Auth field names: the Drizzle adapter maps fields by key.

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    // text, not uuid: Better Auth writes its own non-UUID ids here (lock rows).
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------- relations

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  attendance: many(attendanceLogs, { relationName: "attendee" }),
  excusals: many(excusals, { relationName: "excused" }),
  followUps: many(followUps, { relationName: "subject" }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(users, { fields: [session.userId], references: [users.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(users, { fields: [account.userId], references: [users.id] }),
}));

export const serviceSessionsRelations = relations(serviceSessions, ({ many }) => ({
  attendance: many(attendanceLogs),
  excusals: many(excusals),
}));

export const attendanceLogsRelations = relations(attendanceLogs, ({ one }) => ({
  session: one(serviceSessions, {
    fields: [attendanceLogs.sessionId],
    references: [serviceSessions.id],
  }),
  user: one(users, {
    fields: [attendanceLogs.userId],
    references: [users.id],
    relationName: "attendee",
  }),
}));

export const excusalsRelations = relations(excusals, ({ one }) => ({
  session: one(serviceSessions, {
    fields: [excusals.sessionId],
    references: [serviceSessions.id],
  }),
  user: one(users, { fields: [excusals.userId], references: [users.id], relationName: "excused" }),
}));

export const followUpsRelations = relations(followUps, ({ one }) => ({
  user: one(users, { fields: [followUps.userId], references: [users.id], relationName: "subject" }),
}));

// ---------------------------------------------------------------- row types

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ChurchLocation = typeof churchLocations.$inferSelect;
export type ServiceSession = typeof serviceSessions.$inferSelect;
export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type Excusal = typeof excusals.$inferSelect;
export type NotificationLog = typeof notificationsLog.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;
