import { connection } from "next/server";

import { internalError } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { getMemberStatus } from "@/lib/member-status";

/** The session open now (with my check-in), or the next one. */
export async function GET() {
  await connection();
  const auth = await authorizeApi();
  if (!auth.ok) return auth.response;
  try {
    return Response.json(await getMemberStatus(auth.user.id));
  } catch (error) {
    return internalError("api/sessions/current", error);
  }
}
