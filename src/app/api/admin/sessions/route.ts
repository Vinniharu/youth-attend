import { connection } from "next/server";

import { apiError, internalError, parseBody } from "@/lib/api";
import { appTimeZone } from "@/lib/config";
import { authorizeApi } from "@/lib/dal";
import { createSessionInput } from "@/lib/schemas";
import { createSession, listSessions, SessionError } from "@/lib/sessions";
import { zonedDate } from "@/lib/time";

/** Upcoming sessions (soonest first) and recent past ones, with counts. */
export async function GET() {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  try {
    return Response.json(await listSessions(zonedDate(new Date(), appTimeZone())));
  } catch (error) {
    return internalError("api/admin/sessions GET", error);
  }
}

/** Creates a session for a date, copying the current default geofence. */
export async function POST(request: Request) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const body = await parseBody(request, createSessionInput);
  if (!body.ok) return body.response;
  try {
    return Response.json(
      { session: await createSession(body.data, appTimeZone()) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SessionError) return apiError(error.code, 409);
    return internalError("api/admin/sessions POST", error);
  }
}
