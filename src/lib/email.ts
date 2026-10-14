import "server-only";

import { z } from "zod";

// Transactional email through Brevo's REST API (plain fetch, no SDK).
// https://developers.brevo.com/reference/send-transac-email

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;

export type EmailAddress = { email: string; name?: string };

export type EmailMessage = {
  to: EmailAddress;
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

const brevoResponse = z.object({ messageId: z.string() });

/**
 * Sends one email. Without BREVO_API_KEY it is a no-op in development and an
 * error in production. Throws on any delivery failure; callers decide whether
 * that is fatal. Error messages never include the email body.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BREVO_API_KEY is not set; cannot send email");
    }
    // Not the subject: it can contain a sign-in code.
    console.info(`[email] BREVO_API_KEY not set; skipped ${message.tags?.join(",") ?? "an"} email`);
    return { status: "skipped" };
  }

  const response = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: getSender(),
      to: [message.to],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
      tags: message.tags,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    // Brevo returns { code, message }; safe to log, contains no message content.
    const detail = await response.text().catch(() => "");
    throw new Error(`Brevo responded ${response.status}: ${detail.slice(0, 300)}`);
  }

  const { messageId } = brevoResponse.parse(await response.json());
  return { status: "sent", messageId };
}
