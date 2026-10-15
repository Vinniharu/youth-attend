import { connection } from "next/server";

import { apiError, internalError, parseBody } from "@/lib/api";
import { setEmailNotifications } from "@/lib/preferences";
import { unsubscribeInput } from "@/lib/schemas";
import { createRateLimiter } from "@/lib/rate-limit";
import { verifyUnsubscribe } from "@/lib/unsubscribe";

// Public endpoint: 20 attempts per IP per hour is plenty for real use and makes
// guessing signatures pointless (they're 128-bit anyway).
const limiter = createRateLimiter({ limit: 20, windowMs: 60 * 60_000 });
const clientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

/** Public: the signed link from a "we missed you" email turns those emails off. */
export async function POST(request: Request) {
  await connection();
  if (!limiter.hit(clientIp(request)).ok) return apiError("RATE_LIMITED", 429);
  const body = await parseBody(request, unsubscribeInput);
  if (!body.ok) return body.response;
  try {
    if (!verifyUnsubscribe(body.data.u, body.data.s)) return apiError("INVALID_LINK", 400);
    await setEmailNotifications(body.data.u, false);
    return Response.json({ unsubscribed: true });
  } catch (error) {
    return internalError("api/unsubscribe", error);
  }
}
