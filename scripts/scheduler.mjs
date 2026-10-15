/**
 * Runs the scheduled jobs in church-local time (APP_TIMEZONE) by calling the app's
 * cron routes with CRON_SECRET. Every job is idempotent, so a missed or repeated
 * run is harmless, and admins can do each step by hand from the dashboard.
 *
 *   npm run scheduler            (development, against the app on APP_INTERNAL_URL)
 *   docker compose up scheduler  (the `scheduler` service)
 */
import { Cron } from "croner";

const timezone = process.env.APP_TIMEZONE || "Africa/Lagos";
const base = process.env.APP_INTERNAL_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("[scheduler] CRON_SECRET is not set");
  process.exit(1);
}

const JOBS = [
  { name: "create-session", pattern: "0 6 * * 0" }, // Sunday 06:00
  { name: "open-close", pattern: "*/5 * * * *" }, // every 5 minutes
  { name: "process-absences", pattern: "0 21 * * 0" }, // Sunday 21:00
  { name: "purge-locations", pattern: "0 3 * * *" }, // daily 03:00
];

async function call(name) {
  const started = Date.now();
  try {
    const response = await fetch(`${base}/api/cron/${name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.text();
    const log = response.ok ? console.log : console.error;
    log(
      `[scheduler] ${name} ${response.status} in ${Date.now() - started} ms ${body.slice(0, 300)}`,
    );
  } catch (error) {
    console.error(`[scheduler] ${name} failed:`, error instanceof Error ? error.message : error);
  }
}

const crons = JOBS.map(
  ({ name, pattern }) => new Cron(pattern, { timezone, name, protect: true }, () => call(name)),
);
for (const cron of crons) {
  console.log(`[scheduler] ${cron.name}: next run ${cron.nextRun()?.toISOString()} (${timezone})`);
}

// Catch up on start: a restart near a window edge shouldn't leave a session unopened.
void call("open-close");

const stop = () => {
  for (const cron of crons) cron.stop();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
