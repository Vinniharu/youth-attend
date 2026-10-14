import { connection } from "next/server";

import { authorizeApi } from "@/lib/dal";

/** The signed-in member's profile. */
export async function GET() {
  await connection();
  const auth = await authorizeApi();
  if (!auth.ok) return auth.response;
  return Response.json({ user: auth.user });
}
