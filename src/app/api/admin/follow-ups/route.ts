import { connection } from "next/server";

import { apiError, internalError, parseBody } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { listOpenFollowUps, listResolvedFollowUps, updateFollowUp } from "@/lib/follow-ups";
import { followUpChangeInput } from "@/lib/schemas";

/** Open follow-ups (longest streak first) and recently resolved ones. */
export async function GET() {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  try {
    const [open, resolved] = await Promise.all([listOpenFollowUps(), listResolvedFollowUps()]);
    return Response.json({ open, resolved });
  } catch (error) {
    return internalError("api/admin/follow-ups GET", error);
  }
}

/** Notes, assignment or resolving: `{id, notes?, assignedTo?, resolve?}`. */
export async function PATCH(request: Request) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const body = await parseBody(request, followUpChangeInput);
  if (!body.ok) return body.response;
  try {
    const { id, ...change } = body.data;
    const result = await updateFollowUp(id, change, auth.user.id);
    if (!result.ok) return apiError(result.error, result.error === "NOT_FOUND" ? 404 : 409);
    return Response.json(result);
  } catch (error) {
    return internalError("api/admin/follow-ups PATCH", error);
  }
}
