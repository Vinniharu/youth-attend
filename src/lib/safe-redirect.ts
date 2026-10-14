/**
 * Returns `next` only if it is a same-origin path ("/admin", "/history?x=1"),
 * otherwise `fallback`. Blocks open redirects such as "//evil.com" or "/\evil.com".
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  // Control characters and backslashes can be normalised into a host by browsers.
  if (/[\u0000-\u001f\\]/.test(next)) return fallback;
  return next;
}
