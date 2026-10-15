import "server-only";

import { z } from "zod";

// Transactional email through Resend's REST API (plain fetch, no SDK).
// https://resend.com/docs/api-reference/emails/send-email

const RESEND_URL = "https://api.resend.com/emails";
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const TIMEOUT_MS = 10_000;
/** Longest wait honoured from a 429's Retry-After before retrying once. */
const MAX_RETRY_WAIT_MS = 2_000;

export type EmailAddress = { email: string; name?: string };

export type EmailMessage = {
  to: EmailAddress | EmailAddress[];
  subject: string;
  html: string;
  text: string;
  /** Categories (letters, digits, `_`, `-`), for filtering in the Resend dashboard. */
  tags?: string[];
};

export type SendResult =
  | { status: "sent"; messageId: string }
  /** Development without RESEND_API_KEY: nothing was sent. */
  | { status: "skipped" };

/** Parses `EMAIL_FROM` ("Name <address>" or a bare address) into a sender. */
export function parseSender(from: string): EmailAddress {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const email = (match ? match[2]! : from).trim();
  if (!z.email().safeParse(email).success) {
    throw new Error("EMAIL_FROM is not a valid sender address");
  }
  const name = match?.[1]?.trim();
  return name ? { email, name } : { email };
}

/** Resend's `from`: `Name <address>`, with characters that would break it removed. */
function formatSender({ email, name }: EmailAddress): string {
  const safeName = name?.replace(/["<>\r\n]/g, "").trim();
  return safeName ? `${safeName} <${email}>` : email;
}

let sender: { from: string; formatted: string } | undefined;

/** The validated EMAIL_FROM, cached until the variable changes. */
function getSender(): string {
  const from = process.env.EMAIL_FROM ?? "";
  if (sender?.from !== from) sender = { from, formatted: formatSender(parseSender(from)) };
  return sender.formatted;
}

/**
 * Throws on email misconfiguration in production. Called before a sign-in code is
 * issued, so a missing key or bad sender fails the request instead of silently
 * sending nothing. Signed-in users and every other page keep working.
 */
export function assertEmailConfig(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  getSender();
}

/** Resend key, or null in development (sending is skipped). Throws in production. */
function resendKey(what: string): string | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) return apiKey;
  if (process.env.NODE_ENV === "production") {
    throw new Error("RESEND_API_KEY is not set; cannot send email");
  }
  // Never the subject or body: they can contain a sign-in code.
  console.info(`[email] RESEND_API_KEY not set; skipped ${what}`);
  return null;
}

/** One Resend email object. */
function toResend(message: EmailMessage) {
  const to = Array.isArray(message.to) ? message.to : [message.to];
  return {
    from: getSender(),
    to: to.map((a) => a.email),
    subject: message.subject,
    html: message.html,
    text: message.text,
    tags: message.tags?.map((value) => ({ name: "category", value })),
  };
}

const retryWaitMs = (response: Response) => {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, MAX_RETRY_WAIT_MS)
    : 1_000;
};

async function postToResend(apiKey: string, url: string, body: unknown): Promise<unknown> {
  const post = () =>
    fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  let response = await post();
  if (response.status === 429) {
    // Rate limited: wait as asked (briefly) and try once more.
    await new Promise((resolve) => setTimeout(resolve, retryWaitMs(response)));
    response = await post();
  }
  if (!response.ok) {
    // Resend returns { name, message }; safe to log, contains no message content.
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.json();
}

const sendResponse = z.object({ id: z.string() });
const batchResponse = z.object({ data: z.array(z.object({ id: z.string() })) });

/**
 * Sends one email. Without RESEND_API_KEY it is a no-op in development and an
 * error in production. Throws on any delivery failure; callers decide whether
 * that is fatal. Error messages never include the email body.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = resendKey(`${message.tags?.join(",") ?? "an"} email`);
  if (!apiKey) return { status: "skipped" };
  const { id } = sendResponse.parse(await postToResend(apiKey, RESEND_URL, toResend(message)));
  return { status: "sent", messageId: id };
}

/** Emails per Resend batch request (Resend's maximum). */
export const BATCH_SIZE = 100;

export type BatchResult = { status: "sent"; messageIds: string[] } | { status: "skipped" };

/**
 * Sends many separate emails via Resend's batch endpoint, in requests of up to
 * BATCH_SIZE. `messageIds` follow the order of `messages`.
 */
export async function sendEmailBatch(messages: EmailMessage[]): Promise<BatchResult> {
  const tags = [...new Set(messages.flatMap((m) => m.tags ?? []))].join(",");
  const apiKey = resendKey(`${messages.length} ${tags} emails`);
  if (!apiKey) return { status: "skipped" };

  const messageIds: string[] = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    const { data } = batchResponse.parse(
      await postToResend(apiKey, RESEND_BATCH_URL, chunk.map(toResend)),
    );
    if (data.length !== chunk.length) {
      throw new Error(`Resend returned ${data.length} email ids for ${chunk.length} emails`);
    }
    messageIds.push(...data.map((d) => d.id));
  }
  return { status: "sent", messageIds };
}
