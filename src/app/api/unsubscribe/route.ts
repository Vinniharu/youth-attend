import { connection } from "next/server";

import { apiError, internalError, parseBody } from "@/lib/api";
import { setEmailNotifications } from "@/lib/preferences";
import { unsubscribeInput } from "@/lib/schemas";
import { verifyUnsubscribe } from "@/lib/unsubscribe";

/** Public: the signed link from a "we missed you" email turns those emails off. */
export async function POST(request: Request) {
  await connection();
  const body = await parseBody(request, unsubscribeInput);
  if (!body.ok) return body.response;
  try {
    if (!verifyUnsubscribe(body.data.u, body.data.s)) return apiError("INVALID_LINK", 400);
    await setEmailNotifications(body.data.u, false);
    return Response.json({ unsubscribed: true });
  } catch (error) {
    return internalError("api/unsubscribe", error);
  }
}
