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

/** GPS readings less accurate than this (metres) are rejected with LOW_ACCURACY. */
export const maxAccuracyM = (): number => Number(process.env.MAX_ACCURACY_M) || 75;

/** How long each rotating QR token window lasts, in seconds. */
export const qrWindowSeconds = (): number => Number(process.env.QR_WINDOW_SECONDS) || 30;

/**
 * QR check-ins accept rougher GPS than automatic ones: the fresh code already shows
 * the member is at the church screen. Defaults to twice MAX_ACCURACY_M.
 */
export const qrMaxAccuracyM = (): number =>
  Number(process.env.QR_MAX_ACCURACY_M) || 2 * maxAccuracyM();

/** The public base URL (links in QR codes and emails). */
export const appUrl = (): string => process.env.APP_URL || "http://localhost:3000";
