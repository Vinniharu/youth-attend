import { connection } from "next/server";
import { z } from "zod";

import { processAbsences } from "@/lib/absences";
import { apiError, internalError } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";

/** "Process absences now" for one closed session (the cron job does it on Sunday 21:00). */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/admin/sessions/[id]/process">,
) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError("NOT_FOUND", 404);
  try {
    const run = await processAbsences({ onlySessionId: id });
    if (run.sessions.length === 0) return apiError("NOT_CLOSED", 409);
    return Response.json(run);
  } catch (error) {
    return internalError("api/admin/sessions/process", error);
  }
}
