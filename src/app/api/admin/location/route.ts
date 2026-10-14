import { connection } from "next/server";

import { internalError, parseBody } from "@/lib/api";
import { authorizeApi } from "@/lib/dal";
import { getDefaultLocation, saveDefaultLocation } from "@/lib/location";
import { locationInput } from "@/lib/schemas";

/** The default geofence, or `{ location: null }` before one is set. */
export async function GET() {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ location: await getDefaultLocation() });
  } catch (error) {
    return internalError("api/admin/location GET", error);
  }
}

/** Creates or replaces the default geofence. New sessions copy it; old ones keep theirs. */
export async function PUT(request: Request) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;
  const body = await parseBody(request, locationInput);
  if (!body.ok) return body.response;
  try {
    return Response.json({ location: await saveDefaultLocation(body.data) });
  } catch (error) {
    return internalError("api/admin/location PUT", error);
  }
}
