import { connection } from "next/server";
import { z } from "zod";

import { apiError, internalError, parseBody } from "@/lib/api";
import { appTimeZone } from "@/lib/config";
import { authorizeApi } from "@/lib/dal";
import { updateSessionInput } from "@/lib/schemas";
import { SessionError, updateSession } from "@/lib/sessions";

/** Edits a session's window, or opens, closes or cancels it. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/sessions/[id]">) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError("NOT_FOUND", 404);
  const body = await parseBody(request, updateSessionInput);
  if (!body.ok) return body.response;

  try {
    return Response.json({ session: await updateSession(id, body.data, appTimeZone()) });
  } catch (error) {
    if (error instanceof SessionError) {
      return apiError(error.code, error.code === "NOT_FOUND" ? 404 : 409);
    }
    return internalError("api/admin/sessions PATCH", error);
  }
}
