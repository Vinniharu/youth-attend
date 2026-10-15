import { connection } from "next/server";

import { apiError, internalError } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { authorizeApi } from "@/lib/dal";
import { exportAttendanceRows, exportMembersRows } from "@/lib/members";

/** CSV download: `?type=members` (default) or `?type=attendance` (every check-in). */
export async function GET(request: Request) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const type = new URL(request.url).searchParams.get("type") ?? "members";
  if (type !== "members" && type !== "attendance") return apiError("INVALID_INPUT", 400);
  try {
    const rows = type === "members" ? await exportMembersRows() : await exportAttendanceRows();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="pulse-${type}-${date}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return internalError("api/admin/export", error);
  }
}
