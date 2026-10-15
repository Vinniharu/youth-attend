import { count, eq } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";

import { getDb } from "@/db/client";
import { attendanceLogs, serviceSessions } from "@/db/schema";
import { apiError, internalError } from "@/lib/api";
import { appUrl } from "@/lib/config";
import { authorizeApi } from "@/lib/dal";
import { scanUrl } from "@/lib/qr-link";
import { issueQrToken } from "@/lib/qr-token";

/**
 * The current rotating token for the display page, as the link the QR code encodes.
 * `serverNow` lets the display correct for its own clock when counting down.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/admin/sessions/[id]/qr-token">,
) {
  await connection();
  const auth = await authorizeApi("admin");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError("NOT_FOUND", 404);

  try {
    const [session] = await getDb()
      .select({ status: serviceSessions.status, qrSecret: serviceSessions.qrSecret })
      .from(serviceSessions)
      .where(eq(serviceSessions.id, id))
      .limit(1);
    if (!session) return apiError("NOT_FOUND", 404);
    if (session.status === "cancelled" || session.status === "processed") {
      return apiError("LOCKED", 409);
    }

    const now = new Date();
    const issued = issueQrToken(id, session.qrSecret, now);
    const [checkedIn] = await getDb()
      .select({ n: count() })
      .from(attendanceLogs)
      .where(eq(attendanceLogs.sessionId, id));
    return Response.json(
      {
        url: scanUrl(appUrl(), issued.token),
        token: issued.token,
        expiresAt: issued.expiresAt.toISOString(),
        windowSeconds: issued.windowSeconds,
        serverNow: now.toISOString(),
        status: session.status,
        // The display shows a live count; it polls this endpoint anyway.
        checkedIn: checkedIn?.n ?? 0,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return internalError("api/admin/sessions/qr-token", error);
  }
}
