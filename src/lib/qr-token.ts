import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { isTokenShaped } from "@/lib/qr-link";

// QR tokens, one fixed code per service (the user's choice over rotating codes):
//   sig   = HMAC_SHA256(session.qr_secret, sessionId), first 16 bytes, base64url
//   token = `${sessionId}.${sig}`
// The code is accepted only while its own session is open (checkin.ts), so it ends
// with the service. A shared photo is stopped by the geofence: QR check-ins still
// need the member's location near church. "Reset code" (resetQrSecret) replaces the
// secret, which invalidates every copy of the old code at once.

const SIG_BYTES = 16;

function sign(secret: string, sessionId: string): Buffer {
  return createHmac("sha256", secret).update(sessionId).digest().subarray(0, SIG_BYTES);
}

/** The session's code. Only admins (display page) ever see it. */
export function issueQrToken(sessionId: string, secret: string): string {
  return `${sessionId}.${sign(secret, sessionId).toString("base64url")}`;
}

export type ParsedQrToken = { sessionId: string; sig: Buffer };

/** Splits a token; null if it isn't shaped like one. Says nothing about validity. */
export function parseQrToken(token: string): ParsedQrToken | null {
  if (!isTokenShaped(token)) return null;
  const [sessionId, encoded] = token.split(".");
  const sig = Buffer.from(encoded!, "base64url");
  // 22 base64url characters carry 2 spare bits; accept only the canonical spelling,
  // so each signature has exactly one valid token string.
  if (sig.toString("base64url") !== encoded) return null;
  return { sessionId: sessionId!, sig };
}

/** True if the signature matches this session's current secret. */
export function verifyQrToken(parsed: ParsedQrToken, secret: string): boolean {
  const expected = sign(secret, parsed.sessionId);
  return parsed.sig.length === expected.length && timingSafeEqual(parsed.sig, expected);
}
