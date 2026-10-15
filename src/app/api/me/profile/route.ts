import { connection } from "next/server";

import { internalError, parseBody } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { updateOwnProfile } from "@/lib/preferences";
import { profileInput } from "@/lib/schemas";

/** `{name, phone}`: the signed-in member's own details (welcome step and settings). */
export async function PATCH(request: Request) {
  await connection();
  const auth = await authorizeApi();
  if (!auth.ok) return auth.response;
  const body = await parseBody(request, profileInput);
  if (!body.ok) return body.response;
  try {
    await updateOwnProfile(auth.user.id, body.data);
    return Response.json({ ok: true });
  } catch (error) {
    return internalError("api/me/profile", error);
  }
}
