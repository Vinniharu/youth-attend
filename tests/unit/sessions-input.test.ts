import { describe, expect, it } from "vitest";

import { createSessionInput, locationInput, updateSessionInput } from "@/lib/schemas";
import { upcomingSunday, zonedTime } from "@/lib/time";

describe("upcomingSunday", () => {
  // 2026-10-14 is a Wednesday, 2026-10-18 a Sunday. Lagos is UTC+1.
  it.each([
    ["2026-10-14T12:00:00Z", "2026-10-18"],
    ["2026-10-17T22:59:00Z", "2026-10-18"], // Saturday 23:59 in Lagos
    ["2026-10-17T23:00:00Z", "2026-10-18"], // Sunday 00:00 in Lagos: today
    ["2026-10-18T21:00:00Z", "2026-10-18"], // Sunday evening: still today
    ["2026-10-18T23:00:00Z", "2026-10-25"], // Monday 00:00 in Lagos
  ])("at %s → %s", (now, expected) => {
    expect(upcomingSunday("Africa/Lagos", new Date(now))).toBe(expected);
  });
});

describe("zonedTime", () => {
  it("formats church-local 24-hour time", () => {
    expect(zonedTime(new Date("2026-10-18T07:00:00Z"), "Africa/Lagos")).toBe("08:00");
    expect(zonedTime(new Date("2026-10-18T22:30:00Z"), "Africa/Lagos")).toBe("23:30");
  });
});

describe("session inputs", () => {
  it("accepts a valid session", () => {
    expect(
      createSessionInput.safeParse({ serviceDate: "2026-10-18", start: "08:00", end: "11:30" })
        .success,
    ).toBe(true);
  });

  it.each([
    { serviceDate: "2026-10-18", start: "11:30", end: "08:00" }, // end before start
    { serviceDate: "2026-10-18", start: "08:00", end: "08:00" }, // empty window
    { serviceDate: "2026-02-30", start: "08:00", end: "11:30" }, // impossible date
    { serviceDate: "2026-10-18", start: "8:00", end: "11:30" }, // not HH:mm
    { serviceDate: "2026-10-18", start: "24:00", end: "11:30" },
  ])("rejects %j", (input) => {
    expect(createSessionInput.safeParse(input).success).toBe(false);
  });

  it("requires a change, and only admin-settable statuses", () => {
    expect(updateSessionInput.safeParse({}).success).toBe(false);
    expect(updateSessionInput.safeParse({ status: "processed" }).success).toBe(false);
    expect(updateSessionInput.safeParse({ status: "cancelled" }).success).toBe(true);
    expect(updateSessionInput.safeParse({ status: "scheduled" }).success).toBe(true);
    expect(updateSessionInput.safeParse({ window: { start: "10:00", end: "09:00" } }).success).toBe(
      false,
    );
  });
});

describe("location input", () => {
  const ok = { name: "Main Auditorium", center: { lat: 6.5, lng: 3.4 }, radiusM: 120 };
  it("accepts a valid geofence", () => {
    expect(locationInput.safeParse(ok).success).toBe(true);
  });
  it.each([
    { ...ok, name: "   " },
    { ...ok, radiusM: 19 },
    { ...ok, radiusM: 2001 },
    { ...ok, radiusM: 120.5 },
    { ...ok, center: { lat: 91, lng: 3.4 } },
    { ...ok, center: { lat: 6.5, lng: -181 } },
  ])("rejects %j", (input) => {
    expect(locationInput.safeParse(input).success).toBe(false);
  });
});
