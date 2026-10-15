import { connection } from "next/server";

import { apiError, internalError, parseBody } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { createMember, listMembers } from "@/lib/members";
import { newMemberInput } from "@/lib/schemas";

/** Members, optionally filtered: `?q=` matches name, email or phone. */
export async function GET(request: Request) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  try {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json({ members: await listMembers(q.slice(0, 100)) });
  } catch (error) {
    return internalError("api/admin/members GET", error);
  }
}

/** Adds a member: `{name, email, phone?, role?}`. They then sign in with a code. */
export async function POST(request: Request) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const body = await parseBody(request, newMemberInput);
  if (!body.ok) return body.response;
  try {
    const result = await createMember(body.data);
    if (!result.ok) return apiError(result.error, 409);
    return Response.json({ member: result.member }, { status: 201 });
  } catch (error) {
    return internalError("api/admin/members POST", error);
  }
}
