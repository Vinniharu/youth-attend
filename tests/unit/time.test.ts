import { describe, expect, it } from "vitest";

import { addDays, recentSundays, zonedDate, zonedDateTimeToUtc } from "@/lib/time";

describe("zonedDateTimeToUtc", () => {
  it("converts Lagos (UTC+1, no DST)", () => {
    expect(zonedDateTimeToUtc("2026-10-11", "08:00", "Africa/Lagos").toISOString()).toBe(
      "2026-10-11T07:00:00.000Z",
    );
  });

  it("handles DST: London is UTC+1 in summer, UTC+0 in winter", () => {
    expect(zonedDateTimeToUtc("2026-07-05", "08:00", "Europe/London").toISOString()).toBe(
      "2026-07-05T07:00:00.000Z",
    );
    expect(zonedDateTimeToUtc("2026-12-06", "08:00", "Europe/London").toISOString()).toBe(
      "2026-12-06T08:00:00.000Z",
    );
  });

  it("rejects malformed input", () => {
    expect(() => zonedDateTimeToUtc("2026-10", "08:00", "Africa/Lagos")).toThrow();
  });
});

describe("zonedDate", () => {
  it("uses the local calendar date, not UTC's", () => {
    // 23:30 UTC on Saturday is already Sunday in Lagos.
    expect(zonedDate(new Date("2026-10-10T23:30:00Z"), "Africa/Lagos")).toBe("2026-10-11");
  });
});

describe("recentSundays", () => {
  it("returns past Sundays oldest first, excluding today", () => {
    // Wednesday 2026-10-14
    expect(recentSundays(3, "Africa/Lagos", new Date("2026-10-14T12:00:00Z"))).toEqual([
      "2026-09-27",
      "2026-10-04",
      "2026-10-11",
    ]);
  });

  it("excludes today when today is Sunday", () => {
    expect(recentSundays(1, "Africa/Lagos", new Date("2026-10-11T12:00:00Z"))).toEqual([
      "2026-10-04",
    ]);
  });

  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});
