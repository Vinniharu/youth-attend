import { connection } from "next/server";

import { apiError, internalError, parseBody } from "@/lib/api";
import { recordManualCheckIn } from "@/lib/checkin";
import { authorizeApi } from "@/lib/dal";
import { manualCheckinInput } from "@/lib/schemas";

/** Manual check-in: `{sessionId, userId}`, recorded as `manual_admin` by this admin. */
export async function POST(request: Request) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const body = await parseBody(request, manualCheckinInput);
  if (!body.ok) return body.response;

  try {
    const result = await recordManualCheckIn(auth.user.id, body.data.sessionId, body.data.userId);
    if ("error" in result) {
      return apiError(result.error, result.error === "SESSION_LOCKED" ? 409 : 404);
    }
    return Response.json(result, { status: result.ok && !result.alreadyCheckedIn ? 201 : 200 });
  } catch (error) {
    return internalError("api/admin/attendance", error);
  }
}
