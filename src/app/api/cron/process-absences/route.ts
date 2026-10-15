import { connection } from "next/server";

import { processAbsences } from "@/lib/absences";
import { internalError } from "@/lib/api";
import { rejectUnlessCron } from "@/lib/cron";

/** Sunday 21:00: run the absence engine on every closed, unprocessed session, then email. */
export async function POST(request: Request) {
  await connection();
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
  try {
    return Response.json(await processAbsences());
  } catch (error) {
    return internalError("api/cron/process-absences", error);
  }
}
