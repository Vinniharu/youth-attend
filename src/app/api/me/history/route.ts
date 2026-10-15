import { connection } from "next/server";

import { internalError } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { getMemberHistory } from "@/lib/members";

/** The signed-in member's Sundays: attended, excused, absent or upcoming. */
export async function GET() {
  await connection();
  const auth = await authorizeApi();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ history: await getMemberHistory(auth.user.id) });
  } catch (error) {
    return internalError("api/me/history", error);
  }
}
