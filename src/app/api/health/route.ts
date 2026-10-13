import { sql } from "drizzle-orm";
import { connection, NextResponse } from "next/server";

import { getDb } from "@/db/client";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  // Opt out of prerendering: health must reflect the database at request time.
  await connection();

  try {
    const result = await getDb().execute<{ postgis: string }>(
      sql`select postgis_lib_version() as postgis`,
    );
    const postgis = result.rows[0]?.postgis ?? "unknown";
    return NextResponse.json({ db: "ok", postgis }, { headers: NO_STORE });
  } catch (error) {
    // Log details server-side only; never leak them to the client.
    console.error("[health] database check failed", error);
    return NextResponse.json({ db: "error" }, { status: 503, headers: NO_STORE });
  }
}
