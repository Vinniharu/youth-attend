import { expect, test } from "@playwright/test";

import { attendanceCount, CHURCH, closeE2eDb, setSessionStatus } from "./db";
import { signIn } from "./sign-in";

// The five geolocation scenarios from the Phase 4 done-when check, each as its own
// member so the per-member rate limit never couples the tests.

const metresNorth = (m: number) => ({
  latitude: CHURCH.lat + m / 111_320,
  longitude: CHURCH.lng,
});

test.afterAll(closeE2eDb);

test("inside the geofence: checks in automatically, and stays checked in", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...metresNorth(30), accuracy: 15 });
  await signIn(page, "inside@example.com");

  await expect(page.getByRole("heading", { name: "You're checked in" })).toBeVisible();
  expect(await attendanceCount("inside@example.com")).toBe(1);

  // Reopening the app shows the check-in from the server without a new attempt.
  await context.setGeolocation({ ...metresNorth(5_000), accuracy: 15 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "You're checked in" })).toBeVisible();
  expect(await attendanceCount("inside@example.com")).toBe(1);
});

test("outside the geofence: shows the distance and the QR fallback", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...metresNorth(400), accuracy: 10 });
  await signIn(page, "outside@example.com");

  await expect(page.getByRole("heading", { name: "You're not at church yet" })).toBeVisible();
  // ~400 m by a flat-earth offset; PostGIS measures on the spheroid.
  await expect(page.getByText(/about (39\d|40\d) m away/)).toBeVisible();
  await expect(page.getByText("within 100 m")).toBeVisible();
  await expect(page.getByRole("link", { name: "Scan QR instead" })).toBeVisible();
  expect(await attendanceCount("outside@example.com")).toBe(0);

  // Walking in and trying again checks in.
  await context.setGeolocation({ ...metresNorth(20), accuracy: 10 });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "You're checked in" })).toBeVisible();
});

test("location denied: explains how to turn it on", async ({ page, context }) => {
  await context.clearPermissions();
  await signIn(page, "denied@example.com");

  await expect(page.getByRole("heading", { name: "Location is off for Pulse" })).toBeVisible();
  await expect(page.getByText("allow Location")).toBeVisible(); // Android instructions
  await expect(page.getByRole("link", { name: "Scan QR instead" })).toBeVisible();
  expect(await attendanceCount("denied@example.com")).toBe(0);
});

test("weak GPS: asks for a better signal instead of guessing", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...metresNorth(10), accuracy: 150 });
  await signIn(page, "weak@example.com");

  await expect(page.getByRole("heading", { name: "Your location is too rough" })).toBeVisible();
  await expect(page.getByText(/about 150 m right now/)).toBeVisible();
  expect(await attendanceCount("weak@example.com")).toBe(0);
});

test("no service open: shows when to come back, then checks in when the app returns", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...metresNorth(10), accuracy: 10 });
  await setSessionStatus("scheduled");
  try {
    await signIn(page, "closed@example.com");
    await expect(page.getByRole("heading", { name: "See you on Sunday" })).toBeVisible();
    await expect(page.getByText("No service right now")).toBeVisible();
    expect(await attendanceCount("closed@example.com")).toBe(0);

    // The service opens while the app is in the background; switching back to it
    // (visibilitychange) refreshes the status and checks in without a tap.
    await setSessionStatus("open");
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByRole("heading", { name: "You're checked in" })).toBeVisible();
    expect(await attendanceCount("closed@example.com")).toBe(1);
  } finally {
    await setSessionStatus("open");
  }
});

test("the check-in API refuses anonymous requests", async ({ request }) => {
  const response = await request.post("/api/checkin/geofence", {
    data: { ...CHURCH, accuracy: 10 },
    headers: { origin: "http://localhost" },
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ ok: false, reason: "UNAUTHENTICATED" });
});
