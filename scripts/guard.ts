/**
 * Guard for destructive dev scripts (seed, reset). NODE_ENV alone isn't enough:
 * tsx never sets it. Only local databases are allowed unless explicitly opted in.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db"]);

export function assertLocalDatabase(script: string): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`[${script}] DATABASE_URL is not set`);
    process.exit(1);
  }
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  const allowed = LOCAL_HOSTS.has(host) || process.env.ALLOW_DESTRUCTIVE_DB_SCRIPTS === "1";

  if (process.env.NODE_ENV === "production" || !allowed) {
    console.error(
      `[${script}] refusing to run against "${host}". This script deletes data and only runs on a ` +
        `local database (set ALLOW_DESTRUCTIVE_DB_SCRIPTS=1 to override).`,
    );
    process.exit(1);
  }
}
