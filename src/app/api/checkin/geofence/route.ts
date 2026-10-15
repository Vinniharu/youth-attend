import { connection } from "next/server";

import { internalError, parseBody } from "@/lib/api";
import { checkInWithGeofence } from "@/lib/checkin";
import type { CheckinResult } from "@/lib/checkin-types";
import { authorizeApi } from "@/lib/dal";
import { createRateLimiter } from "@/lib/rate-limit";
import { checkinInput } from "@/lib/schemas";

// 5 attempts per member per 5 minutes (per the spec), across all check-in methods
// once the QR route exists.
const limiter = createRateLimiter({ limit: 5, windowMs: 5 * 60_000 });

const result = (body: CheckinResult, status = 200) => Response.json(body, { status });

/** `{lat, lng, accuracy}` → CheckinResult. Expected outcomes are 200 with `ok: false`. */
export async function POST(request: Request) {
  await connection();
  const auth = await authorizeApi();
  if (!auth.ok) return result({ ok: false, reason: "UNAUTHENTICATED" }, 401);

  const limited = limiter.hit(auth.user.id);
  if (!limited.ok) {
    return result(
      { ok: false, reason: "RATE_LIMITED", retryAfterS: Math.ceil(limited.retryAfterMs / 1000) },
      429,
    );
  }

  const body = await parseBody(request, checkinInput);
  if (!body.ok) return body.response;

  try {
    return result(
      await checkInWithGeofence(auth.user.id, body.data, request.headers.get("user-agent")),
    );
  } catch (error) {
    return internalError("api/checkin/geofence", error);
  }
}
