import "server-only";

import { z } from "zod";

// Transactional email through Brevo's REST API (plain fetch, no SDK).
// https://developers.brevo.com/reference/send-transac-email

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;

export type EmailAddress = { email: string; name?: string };

export type EmailMessage = {
  to: EmailAddress | EmailAddress[];
  subject: string;
  html: string;
  text: string;
  /** Brevo tags, for filtering in the Brevo dashboard. */
  tags?: string[];
};

export type SendResult =
  | { status: "sent"; messageId: string }
  /** Development without BREVO_API_KEY: nothing was sent. */
  | { status: "skipped" };

/** Parses `EMAIL_FROM` ("Name <address>" or a bare address) into a Brevo sender. */
export function parseSender(from: string): EmailAddress {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const email = (match ? match[2]! : from).trim();
  if (!z.email().safeParse(email).success) {
    throw new Error("EMAIL_FROM is not a valid sender address");
  }
  const name = match?.[1]?.trim();
  return name ? { email, name } : { email };
}

let sender: { from: string; parsed: EmailAddress } | undefined;

/** The parsed EMAIL_FROM, cached until the variable changes. */
function getSender(): EmailAddress {
  const from = process.env.EMAIL_FROM ?? "";
  if (sender?.from !== from) sender = { from, parsed: parseSender(from) };
  return sender.parsed;
}

/**
 * Throws on email misconfiguration in production. Called before a sign-in code is
 * issued, so a missing key or bad sender fails the request instead of silently
 * sending nothing. Signed-in users and every other page keep working.
 */
export function assertEmailConfig(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY is not set");
  getSender();
}

/** Brevo answers `{ messageId }` for one message, `{ messageIds }` for a batch. */
const brevoResponse = z.object({
  messageId: z.string().optional(),
  messageIds: z.array(z.string()).optional(),
});

/** Brevo key, or null in development (sending is skipped). Throws in production. */
function brevoKey(what: string): string | null {
  const apiKey = process.env.BREVO_API_KEY;
  if (apiKey) return apiKey;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BREVO_API_KEY is not set; cannot send email");
  }
  // Never the subject or body: they can contain a sign-in code.
  console.info(`[email] BREVO_API_KEY not set; skipped ${what}`);
  return null;
}

async function postToBrevo(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ sender: getSender(), ...body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    // Brevo returns { code, message }; safe to log, contains no message content.
    const detail = await response.text().catch(() => "");
    throw new Error(`Brevo responded ${response.status}: ${detail.slice(0, 300)}`);
  }
  return brevoResponse.parse(await response.json());
}

/**
 * Sends one email. Without BREVO_API_KEY it is a no-op in development and an
 * error in production. Throws on any delivery failure; callers decide whether
 * that is fatal. Error messages never include the email body.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = brevoKey(`${message.tags?.join(",") ?? "an"} email`);
  if (!apiKey) return { status: "skipped" };
  const { messageId, messageIds } = await postToBrevo(apiKey, {
    to: Array.isArray(message.to) ? message.to : [message.to],
    subject: message.subject,
    htmlContent: message.html,
    textContent: message.text,
    tags: message.tags,
  });
  const id = messageId ?? messageIds?.[0];
  if (!id) throw new Error("Brevo returned no message id");
  return { status: "sent", messageId: id };
}

/** Recipients per Brevo request: one per version, well under its 2000 limit. */
export const BATCH_SIZE = 100;

export type BatchMessage = {
  /** Shared subject/HTML/text; may use Brevo placeholders like `{{ params.firstName }}`. */
  subject: string;
  html: string;
  text: string;
  tags?: string[];
  /** One version per recipient, with that recipient's placeholder values. */
  versions: { to: EmailAddress; params: Record<string, string> }[];
};

export type BatchResult = { status: "sent"; messageIds: string[] } | { status: "skipped" };

/**
 * Sends one personalised email to many people via Brevo `messageVersions`, in
 * requests of up to BATCH_SIZE. `messageIds` follow the order of `versions`.
 */
export async function sendEmailBatch(message: BatchMessage): Promise<BatchResult> {
  const apiKey = brevoKey(`${message.versions.length} ${message.tags?.join(",") ?? ""} emails`);
  if (!apiKey) return { status: "skipped" };

  const messageIds: string[] = [];
  for (let i = 0; i < message.versions.length; i += BATCH_SIZE) {
    const chunk = message.versions.slice(i, i + BATCH_SIZE);
    const result = await postToBrevo(apiKey, {
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
      tags: message.tags,
      messageVersions: chunk.map((v) => ({ to: [v.to], params: v.params })),
    });
    const ids = result.messageIds ?? (result.messageId ? [result.messageId] : []);
    if (ids.length !== chunk.length) {
      throw new Error(`Brevo returned ${ids.length} message ids for ${chunk.length} emails`);
    }
    messageIds.push(...ids);
  }
  return { status: "sent", messageIds };
}
