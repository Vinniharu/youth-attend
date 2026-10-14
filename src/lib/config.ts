// Behaviour settings from the environment, with their defaults in one place.
// Plain functions (not constants) so tests and scripts see the current env.
// Server-side only in practice: these variables aren't exposed to the browser.

/** The church's timezone; every wall-clock time in the app is in this zone. */
export const appTimeZone = (): string => process.env.APP_TIMEZONE || "Africa/Lagos";

/** Default check-in window for new sessions, as church-local "HH:mm". */
export const defaultServiceWindow = (): { start: string; end: string } => ({
  start: process.env.DEFAULT_SERVICE_START || "08:00",
  end: process.env.DEFAULT_SERVICE_END || "11:30",
});
