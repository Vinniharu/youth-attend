/**
 * Timezone helpers built on Intl (no dependencies). Church times are local to
 * APP_TIMEZONE; everything stored in the database is UTC.
 */

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Converts a wall-clock time in `timeZone` to a UTC Date.
 * e.g. zonedDateTimeToUtc("2026-10-11", "08:00", "Africa/Lagos") → 2026-10-11T07:00:00Z
 */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => n === undefined || Number.isNaN(n))) {
    throw new Error(`Invalid date/time: ${date} ${time}`);
  }
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  // Two passes settle the offset correctly around DST transitions.
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - zoneOffsetMs(new Date(first), timeZone));
}

/** The calendar date (YYYY-MM-DD) of `instant` in `timeZone`. */
export function zonedDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Adds whole days to a YYYY-MM-DD date string. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The `count` most recent Sundays strictly before today's date in `timeZone`,
 * oldest first.
 */
export function recentSundays(count: number, timeZone: string, now = new Date()): string[] {
  const today = zonedDate(now, timeZone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const lastSunday = addDays(today, weekday === 0 ? -7 : -weekday);
  return Array.from({ length: count }, (_, i) => addDays(lastSunday, -7 * (count - 1 - i)));
}

/** Today's date in `timeZone` if it is a Sunday, otherwise the next Sunday. */
export function upcomingSunday(timeZone: string, now = new Date()): string {
  const today = zonedDate(now, timeZone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(today, weekday === 0 ? 0 : 7 - weekday);
}

/** Wall-clock "HH:mm" of `instant` in `timeZone`. */
export function zonedTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}
