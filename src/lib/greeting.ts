/** "Good morning" / "Good afternoon" / "Good evening" for the hour in `timeZone`. */
export function greeting(now: Date, timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** First word of a display name, for friendly greetings. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
