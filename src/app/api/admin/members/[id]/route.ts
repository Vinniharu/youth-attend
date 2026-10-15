import { connection } from "next/server";
import { z } from "zod";

import { apiError, internalError, parseBody } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { getMemberHistory, updateMember } from "@/lib/members";
import { memberChangeInput } from "@/lib/schemas";

/** One member's Sundays (attended, excused, absent, upcoming). */
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/members/[id]">) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError("NOT_FOUND", 404);
  try {
    return Response.json({ history: await getMemberHistory(id) });
  } catch (error) {
    return internalError("api/admin/members/[id] GET", error);
  }
}

/** Edits a member (name, email, phone, role) or deactivates/reactivates them. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/members/[id]">) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError("NOT_FOUND", 404);
  const body = await parseBody(request, memberChangeInput);
  if (!body.ok) return body.response;
  try {
    const result = await updateMember(id, body.data, auth.user.id);
    if (!result.ok) {
      return apiError(result.error, result.error === "NOT_FOUND" ? 404 : 409);
    }
    return Response.json({ member: result.member });
  } catch (error) {
    return internalError("api/admin/members/[id] PATCH", error);
  }
}
