import { connection } from "next/server";

import { apiError, internalError } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { importMembersCsv } from "@/lib/members";

const MAX_BYTES = 1024 * 1024;

/** CSV import: the request body is the CSV text (`name,email[,phone]` header). */
export async function POST(request: Request) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return apiError("TOO_LARGE", 413);
  const text = await request.text();
  if (text.length > MAX_BYTES) return apiError("TOO_LARGE", 413);
  try {
    return Response.json(await importMembersCsv(text));
  } catch (error) {
    return internalError("api/admin/members/import", error);
  }
}
