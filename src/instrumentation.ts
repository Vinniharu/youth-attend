import type { Instrumentation } from "next";

/**
 * Server error logging: one JSON line per unhandled server error on stdout, which
 * `docker compose logs app` (and any log shipper) collects. Deliberately leaves out
 * request headers, cookies and bodies, so no session tokens or personal data end
 * up in logs.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(
    JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      message: err.message,
      digest:
        typeof error === "object" && error !== null && "digest" in error
          ? String(error.digest)
          : undefined,
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
      stack: err.stack?.split("\n").slice(0, 6).join("\n"),
    }),
  );
};
