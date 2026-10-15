import "server-only";

import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { createElement } from "react";
import { render, toPlainText } from "react-email";

import { getDb } from "@/db/client";
import { attendanceLogs, notificationsLog, serviceSessions, users } from "@/db/schema";
import { AdminFlagAlertEmail } from "@/emails/admin-flag-alert";
import { MissedYouEmail } from "@/emails/missed-you";
import { adminAlertEmails, appUrl } from "@/lib/config";
import { type EmailMessage, sendEmailBatch } from "@/lib/email";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { firstName } from "@/lib/greeting";

// Sends what the absence engine queued in notifications_log, after its transaction
// has committed. Rows are claimed atomically (status → "sending"), so two runs
// can't send the same email; failures are recorded and retried by the next run.

const RETRY_WINDOW = sql`now() - interval '7 days'`;
const ERROR_MAX = 500;

export type SendSummary = { sent: number; failed: number; skipped: number };

const dayLabel = (serviceDate: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${serviceDate}T00:00:00Z`));

type Claimed = {
  id: string;
  type: "single_absence" | "flagged_member";
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  emailNotifications: boolean;
  consecutiveAbsences: number;
  serviceDate: string | null;
  sessionId: string | null;
};

/** Marks queued (or previously failed, recent) rows as "sending" and returns them. */
async function claim(): Promise<Claimed[]> {
  const db = getDb();
  const ids = await db
    .update(notificationsLog)
    .set({ status: "sending", error: null })
    .where(
      and(
        inArray(notificationsLog.status, ["pending", "failed"]),
        gt(notificationsLog.createdAt, RETRY_WINDOW),
      ),
    )
    .returning({ id: notificationsLog.id });
  if (ids.length === 0) return [];

  return db
    .select({
      id: notificationsLog.id,
      type: notificationsLog.type,
      userId: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      emailNotifications: users.emailNotifications,
      consecutiveAbsences: users.consecutiveAbsences,
      serviceDate: serviceSessions.serviceDate,
      sessionId: serviceSessions.id,
    })
    .from(notificationsLog)
    .innerJoin(users, eq(users.id, notificationsLog.userId))
    .leftJoin(serviceSessions, eq(serviceSessions.id, notificationsLog.sessionId))
    .where(
      inArray(
        notificationsLog.id,
        ids.map((r) => r.id),
      ),
    );
}

async function mark(
  ids: string[],
  status: "sent" | "failed" | "skipped",
  extra: { providerMessageId?: string; error?: string } = {},
) {
  if (ids.length === 0) return;
  await getDb()
    .update(notificationsLog)
    .set({
      status,
      providerMessageId: extra.providerMessageId ?? null,
      error: extra.error?.slice(0, ERROR_MAX) ?? null,
    })
    .where(inArray(notificationsLog.id, ids));
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Sends one email per row as Resend batches and records each row's outcome.
 * `build` runs inside the try, so a rendering error also marks the rows failed.
 */
async function sendBatchFor(
  rows: Claimed[],
  build: () => Promise<EmailMessage[]>,
  label: string,
  summary: SendSummary,
) {
  if (rows.length === 0) return;
  try {
    const result = await sendEmailBatch(await build());
    if (result.status === "skipped") {
      await mark(
        rows.map((r) => r.id),
        "skipped",
        { error: "email not configured (development)" },
      );
      summary.skipped += rows.length;
      return;
    }
    // One update per row: each has its own Resend email id.
    for (const [i, row] of rows.entries()) {
      await mark([row.id], "sent", { providerMessageId: result.messageIds[i] });
    }
    summary.sent += rows.length;
  } catch (error) {
    console.error(`[notifications] ${label} batch failed`, error);
    await mark(
      rows.map((r) => r.id),
      "failed",
      { error: describe(error) },
    );
    summary.failed += rows.length;
  }
}

/** "We missed you" emails: one batch per Sunday, personalised per member. */
async function sendMissedYou(rows: Claimed[], summary: SendSummary) {
  const bySession = Map.groupBy(rows, (r) => r.serviceDate ?? "");
  for (const [serviceDate, group] of bySession) {
    const serviceDay = dayLabel(serviceDate);
    await sendBatchFor(
      group,
      () =>
        Promise.all(
          group.map(async (r) => {
            const html = await render(
              createElement(MissedYouEmail, {
                firstName: firstName(r.name),
                serviceDay,
                appUrl: appUrl(),
                unsubscribeUrl: unsubscribeUrl(r.userId),
              }),
            );
            return {
              to: { email: r.email, name: r.name },
              subject: `We missed you on ${serviceDay}`,
              html,
              text: toPlainText(html),
              tags: ["missed-you"],
            };
          }),
        ),
      "missed-you",
      summary,
    );
  }
}

async function lastAttended(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ serviceDate: serviceSessions.serviceDate })
    .from(attendanceLogs)
    .innerJoin(serviceSessions, eq(serviceSessions.id, attendanceLogs.sessionId))
    .where(eq(attendanceLogs.userId, userId))
    .orderBy(desc(serviceSessions.serviceDate))
    .limit(1);
  return row ? dayLabel(row.serviceDate) : null;
}

/** "Needs a follow-up" alerts: one email per flagged member to every leader, in one batch. */
async function sendFlagAlerts(rows: Claimed[], summary: SendSummary) {
  if (rows.length === 0) return;
  const leaders = adminAlertEmails();
  if (leaders.length === 0) {
    await mark(
      rows.map((r) => r.id),
      "skipped",
      { error: "ADMIN_ALERT_EMAILS is empty" },
    );
    summary.skipped += rows.length;
    return;
  }
  const followUpUrl = new URL("/admin/follow-ups", appUrl()).toString();
  await sendBatchFor(
    rows,
    () =>
      Promise.all(
        rows.map(async (row) => {
          const html = await render(
            createElement(AdminFlagAlertEmail, {
              memberName: row.name,
              streak: row.consecutiveAbsences,
              lastAttended: await lastAttended(row.userId),
              followUpUrl,
            }),
          );
          return {
            to: leaders.map((email) => ({ email })),
            subject: `${row.name} has missed ${row.consecutiveAbsences} Sundays`,
            html,
            text: toPlainText(html),
            tags: ["flag-alert"],
          };
        }),
      ),
    "flag alert",
    summary,
  );
}

/** Sends every queued notification. Safe to call any time (the cron job does). */
export async function sendPendingNotifications(): Promise<SendSummary> {
  const summary: SendSummary = { sent: 0, failed: 0, skipped: 0 };
  const rows = await claim();

  // Members who unsubscribed or left since the row was queued get nothing.
  const optedOut = rows.filter(
    (r) => r.type === "single_absence" && (!r.emailNotifications || !r.isActive),
  );
  await mark(
    optedOut.map((r) => r.id),
    "skipped",
    { error: "member unsubscribed or inactive" },
  );
  summary.skipped += optedOut.length;

  await sendMissedYou(
    rows.filter((r) => r.type === "single_absence" && r.emailNotifications && r.isActive),
    summary,
  );
  await sendFlagAlerts(
    rows.filter((r) => r.type === "flagged_member"),
    summary,
  );
  return summary;
}
