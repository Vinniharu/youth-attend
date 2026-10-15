import { connection } from "next/server";

import { internalError } from "@/lib/api";
import { rejectUnlessCron } from "@/lib/cron";
import { openAndCloseSessions } from "@/lib/jobs";

/** Every 5 minutes: open and close sessions by their window. */
export async function POST(request: Request) {
  await connection();
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
  try {
    return Response.json(await openAndCloseSessions());
  } catch (error) {
    return internalError("api/cron/open-close", error);
  }
}
