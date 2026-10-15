import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { qrWindowSeconds } from "@/lib/config";
import { isTokenShaped } from "@/lib/qr-link";

// Rotating QR tokens (spec "Rotating QR token"):
//   window = floor(unixSeconds / QR_WINDOW_SECONDS)
//   sig    = HMAC_SHA256(session.qr_secret, `${sessionId}.${window}`), first 16 bytes, base64url
//   token  = `${sessionId}.${window}.${sig}`
// A token is accepted in its own window and the next one (scan delay, clock drift),
// so a screenshot stops working within two windows: about 60 s by default.

const SIG_BYTES = 16;

export const qrWindowAt = (now: Date, windowSeconds = qrWindowSeconds()) =>
  Math.floor(now.getTime() / 1000 / windowSeconds);

function sign(secret: string, sessionId: string, window: number): Buffer {
  return createHmac("sha256", secret)
    .update(`${sessionId}.${window}`)
    .digest()
    .subarray(0, SIG_BYTES);
}

export type IssuedQrToken = {
  token: string;
  window: number;
  /** When this window ends (the display rotates then). */
  expiresAt: Date;
  windowSeconds: number;
};

/** The token for the current window. Only admins (display page) ever see it. */
export function issueQrToken(
  sessionId: string,
  secret: string,
  now = new Date(),
  windowSeconds = qrWindowSeconds(),
): IssuedQrToken {
  const window = qrWindowAt(now, windowSeconds);
  const sig = sign(secret, sessionId, window).toString("base64url");
  return {
    token: `${sessionId}.${window}.${sig}`,
    window,
    expiresAt: new Date((window + 1) * windowSeconds * 1000),
    windowSeconds,
  };
}

export type ParsedQrToken = { sessionId: string; window: number; sig: Buffer };

/** Splits a token; null if it isn't shaped like one. Says nothing about validity. */
export function parseQrToken(token: string): ParsedQrToken | null {
  if (!isTokenShaped(token)) return null;
  const [sessionId, window, encoded] = token.split(".");
  const sig = Buffer.from(encoded!, "base64url");
  // 22 base64url characters carry 2 spare bits; accept only the canonical spelling,
  // so each signature has exactly one valid token string.
  if (sig.toString("base64url") !== encoded) return null;
  return { sessionId: sessionId!, window: Number(window), sig };
}

/**
 * "valid" for this window or the previous one; "expired" for a genuine but older
 * token (a screenshot); "invalid" for a forged, tampered or future one.
 */
export function verifyQrToken(
  parsed: ParsedQrToken,
  secret: string,
  now = new Date(),
  windowSeconds = qrWindowSeconds(),
): "valid" | "expired" | "invalid" {
  const expected = sign(secret, parsed.sessionId, parsed.window);
  if (parsed.sig.length !== expected.length || !timingSafeEqual(parsed.sig, expected)) {
    return "invalid";
  }
  const current = qrWindowAt(now, windowSeconds);
  if (parsed.window > current) return "invalid";
  return current - parsed.window <= 1 ? "valid" : "expired";
}
