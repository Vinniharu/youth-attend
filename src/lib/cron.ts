import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { apiError } from "@/lib/api";

/**
 * Cron routes accept only `Authorization: Bearer $CRON_SECRET`. Returns a response to
 * send back when the request isn't allowed, or null when it is.
 */
export function rejectUnlessCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set; refusing to run jobs");
    return apiError("CRON_DISABLED", 503);
  }
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  // Compare digests so the comparison is constant-time whatever the lengths.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!given || !timingSafeEqual(digest(given), digest(secret))) {
    return apiError("UNAUTHORIZED", 401);
  }
  return null;
}
