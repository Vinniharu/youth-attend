import { connection } from "next/server";
import { z } from "zod";

import { apiError, internalError } from "@/lib/api";
import { getSessionAttendance } from "@/lib/attendance";
import { authorizeApi } from "@/lib/dal";

/** Attendees, excused members and absentees for one session. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/admin/sessions/[id]/attendance">,
) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError("NOT_FOUND", 404);
  try {
    const attendance = await getSessionAttendance(id);
    return attendance ? Response.json(attendance) : apiError("NOT_FOUND", 404);
  } catch (error) {
    return internalError("api/admin/sessions/attendance", error);
  }
}
