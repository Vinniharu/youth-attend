import { connection } from "next/server";

import { internalError } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { getAttendanceTrend, getMemberCounts, getThisSunday } from "@/lib/stats";

/** Dashboard numbers: member counts, this Sunday's live count, and a 12-week trend. */
export async function GET() {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  try {
    const [counts, thisSunday, trend] = await Promise.all([
      getMemberCounts(),
      getThisSunday(),
      getAttendanceTrend(12),
    ]);
    return Response.json({ ...counts, thisSunday, trend });
  } catch (error) {
    return internalError("api/admin/stats", error);
  }
}
