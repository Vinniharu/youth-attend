import { connection } from "next/server";

import { internalError } from "@/lib/api";
import { rejectUnlessCron } from "@/lib/cron";
import { purgeOldLocations } from "@/lib/jobs";

/** Daily 03:00: null out check-in coordinates older than LOCATION_RETENTION_DAYS. */
export async function POST(request: Request) {
  await connection();
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
  try {
    return Response.json(await purgeOldLocations());
  } catch (error) {
    return internalError("api/cron/purge-locations", error);
  }
}
