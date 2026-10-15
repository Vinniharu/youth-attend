import { connection } from "next/server";
import { z } from "zod";

import { apiError, internalError } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { SessionError, resetQrSecret } from "@/lib/sessions";

/** "Reset code": a new check-in code for the session; every old copy stops working. */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/admin/sessions/[id]/qr-reset">,
) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError("NOT_FOUND", 404);
  try {
    await resetQrSecret(id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SessionError) {
      return apiError(error.code, error.code === "NOT_FOUND" ? 404 : 409);
    }
    return internalError("api/admin/sessions/qr-reset", error);
  }
}
