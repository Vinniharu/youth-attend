// QR code contents. Client-safe (the scanner parses them; no crypto here).
//
// The code holds a link, `<app>/scan?t=<token>`, so a phone's ordinary camera app
// opens Pulse straight at the check-in step; the in-app scanner reads the same link.

/** `<sessionId>.<signature>`: UUID and 16 bytes base64url (22 chars). */
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{22}$/;

export const isTokenShaped = (value: string) => TOKEN.test(value);

/** The URL a QR code encodes for `token`. */
export function scanUrl(appUrl: string, token: string): string {
  const url = new URL("/scan", appUrl);
  url.searchParams.set("t", token);
  return url.toString();
}

/**
 * The token from whatever a scanner read: a Pulse scan link, or a bare token.
 * Returns null for anything else (another QR code entirely).
 */
export function extractToken(scanned: string): string | null {
  const text = scanned.trim();
  if (isTokenShaped(text)) return text;
  try {
    const url = new URL(text);
    const token = url.pathname === "/scan" ? url.searchParams.get("t") : null;
    return token && isTokenShaped(token) ? token : null;
  } catch {
    return null;
  }
}
