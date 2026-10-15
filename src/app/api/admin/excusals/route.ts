import { connection } from "next/server";

import { apiError, internalError, parseBody } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { addExcusal, removeExcusal } from "@/lib/excusals";
import { excusalInput } from "@/lib/schemas";

const status = (error: string) => (error === "SESSION_NOT_FOUND" ? 404 : 409);

/** Excuses a member from a session: `{sessionId, userId, reason?}`. */
export async function POST(request: Request) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const body = await parseBody(request, excusalInput);
  if (!body.ok) return body.response;
  try {
    const { sessionId, userId, reason } = body.data;
    const result = await addExcusal(sessionId, userId, reason, auth.user.id);
    return result.ok
      ? Response.json(result, { status: 201 })
      : apiError(result.error, status(result.error));
  } catch (error) {
    return internalError("api/admin/excusals POST", error);
  }
}

/** Removes an excusal: `{sessionId, userId}`. */
export async function DELETE(request: Request) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const body = await parseBody(request, excusalInput);
  if (!body.ok) return body.response;
  try {
    const result = await removeExcusal(body.data.sessionId, body.data.userId);
    return result.ok ? Response.json(result) : apiError(result.error, status(result.error));
  } catch (error) {
    return internalError("api/admin/excusals DELETE", error);
  }
}
