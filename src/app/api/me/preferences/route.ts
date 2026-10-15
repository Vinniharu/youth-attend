import { connection } from "next/server";

import { internalError, parseBody } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { setEmailNotifications } from "@/lib/preferences";
import { preferencesInput } from "@/lib/schemas";

/** `{emailNotifications}`: turn "we missed you" emails on or off. */
export async function PATCH(request: Request) {
  await connection();
  const auth = await authorizeApi();
  if (!auth.ok) return auth.response;
  const body = await parseBody(request, preferencesInput);
  if (!body.ok) return body.response;
  try {
    await setEmailNotifications(auth.user.id, body.data.emailNotifications);
    return Response.json({ emailNotifications: body.data.emailNotifications });
  } catch (error) {
    return internalError("api/me/preferences", error);
  }
}
