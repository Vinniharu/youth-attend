import { connection } from "next/server";

import { authorizeApi } from "@/lib/dal";
import { getMemberCounts } from "@/lib/stats";

/** Dashboard numbers. Phase 8 adds this Sunday's count and the 12-week trend. */
export async function GET() {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  try {
    return Response.json(await getMemberCounts());
  } catch (error) {
    console.error("[api/admin/stats]", error);
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}
