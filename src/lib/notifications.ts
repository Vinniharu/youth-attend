import "server-only";

import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { createElement } from "react";
import { render, toPlainText } from "react-email";

import { getDb } from "@/db/client";
import { attendanceLogs, notificationsLog, serviceSessions, users } from "@/db/schema";
import { AdminFlagAlertEmail } from "@/emails/admin-flag-alert";
import { MissedYouEmail } from "@/emails/missed-you";
import { adminAlertEmails, appUrl } from "@/lib/config";
import { sendEmail, sendEmailBatch } from "@/lib/email";
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

/** "We missed you" emails, one Brevo batch per Sunday. */
async function sendMissedYou(rows: Claimed[], summary: SendSummary) {
  const bySession = Map.groupBy(rows, (r) => r.serviceDate ?? "");
  for (const [serviceDate, group] of bySession) {
    const html = await render(
      createElement(MissedYouEmail, {
        firstName: "{{ params.firstName }}",
        serviceDay: dayLabel(serviceDate),
        appUrl: appUrl(),
        unsubscribeUrl: "{{ params.unsubscribeUrl }}",
      }),
    );
    try {
      const result = await sendEmailBatch({
        subject: `We missed you on ${dayLabel(serviceDate)}`,
        html,
        text: toPlainText(html),
        tags: ["missed-you"],
        versions: group.map((r) => ({
          to: { email: r.email, name: r.name },
          params: { firstName: firstName(r.name), unsubscribeUrl: unsubscribeUrl(r.userId) },
        })),
      });
      if (result.status === "skipped") {
        await mark(
          group.map((r) => r.id),
          "skipped",
          { error: "email not configured (development)" },
        );
        summary.skipped += group.length;
        continue;
      }
      // One update per row: each has its own Brevo message id.
      for (const [i, row] of group.entries()) {
        await mark([row.id], "sent", { providerMessageId: result.messageIds[i] });
      }
      summary.sent += group.length;
    } catch (error) {
      console.error("[notifications] missed-you batch failed", error);
      await mark(
        group.map((r) => r.id),
        "failed",
        { error: describe(error) },
      );
      summary.failed += group.length;
    }
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

/** "Needs a follow-up" alerts, one email per flagged member to every leader. */
async function sendFlagAlerts(rows: Claimed[], summary: SendSummary) {
  const leaders = adminAlertEmails();
  for (const row of rows) {
    if (leaders.length === 0) {
      await mark([row.id], "skipped", { error: "ADMIN_ALERT_EMAILS is empty" });
      summary.skipped += 1;
      continue;
    }
    try {
      const html = await render(
        createElement(AdminFlagAlertEmail, {
          memberName: row.name,
          streak: row.consecutiveAbsences,
          lastAttended: await lastAttended(row.userId),
          followUpUrl: new URL("/admin/follow-ups", appUrl()).toString(),
        }),
      );
      const result = await sendEmail({
        to: leaders.map((email) => ({ email })),
        subject: `${row.name} has missed ${row.consecutiveAbsences} Sundays`,
        html,
        text: toPlainText(html),
        tags: ["flag-alert"],
      });
      if (result.status === "skipped") {
        await mark([row.id], "skipped", { error: "email not configured (development)" });
        summary.skipped += 1;
      } else {
        await mark([row.id], "sent", { providerMessageId: result.messageId });
        summary.sent += 1;
      }
    } catch (error) {
      console.error("[notifications] flag alert failed", error);
      await mark([row.id], "failed", { error: describe(error) });
      summary.failed += 1;
    }
  }
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
