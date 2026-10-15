import { connection } from "next/server";

import { internalError } from "@/lib/api";
import { rejectUnlessCron } from "@/lib/cron";
import { createUpcomingSession } from "@/lib/jobs";

/** Sunday 06:00: create this Sunday's session from the default geofence and window. */
export async function POST(request: Request) {
  await connection();
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
  try {
    return Response.json(await createUpcomingSession());
  } catch (error) {
    return internalError("api/cron/create-session", error);
  }
}
