import "server-only";

import type { z } from "zod";

/** JSON error response with a stable machine-readable code and no internals. */
export function apiError(code: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ error: code, ...extra }, { status });
}

/**
 * Parses a JSON body with `schema`. Returns the data, or a 400 response listing
 * field issues (paths and messages only; never echoes input values).
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { ok: false, response: apiError("INVALID_JSON", 400) };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return { ok: false, response: apiError("INVALID_INPUT", 400, { issues }) };
  }
  return { ok: true, data: result.data };
}

/** Logs an unexpected error server-side and returns a generic 500. */
export function internalError(where: string, error: unknown) {
  console.error(`[${where}]`, error);
  return apiError("INTERNAL", 500);
}
