import { type Browser, devices, expect, type Page, test } from "@playwright/test";

import { attendanceCount, CHURCH, closeE2eDb, openSessionId } from "./db";
import { signIn } from "./sign-in";

// Phase 6 done-when: a screenshot of the QR stops working within about 60 s, and a
// valid scan from outside the geofence is rejected. Members arrive the way a phone's
// camera app brings them: the code is a link to /scan?t=<token>.

const metresNorth = (m: number) => ({ latitude: CHURCH.lat + m / 111_320, longitude: CHURCH.lng });

async function displayedLink(page: Page): Promise<string> {
  await signIn(page, "leader@example.com", "admin");
  await page.goto(`/admin/sessions/${await openSessionId()}/display`);
  await expect(page.getByRole("heading", { name: /Scan to check in/ })).toBeVisible();
  const url = await page.locator("[data-qr-url]").getAttribute("data-qr-url");
  expect(url).toMatch(/\/scan\?t=/);
  return url!;
}

/** A member's phone at `metres` from church, opening `link` as the camera app would. */
async function scanAs(browser: Browser, email: string, link: string, metres: number) {
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: test.info().project.use.baseURL,
    permissions: ["geolocation"],
    geolocation: { ...metresNorth(metres), accuracy: 20 },
  });
  const page = await context.newPage();
  await signIn(page, email);
  const { pathname, search } = new URL(link);
  await page.goto(`${pathname}${search}`);
  return { page, context };
}

test.afterAll(closeE2eDb);

test("a scan inside the geofence checks the member in", async ({ page, browser }) => {
  const link = await displayedLink(page);
  const member = await scanAs(browser, "qr-inside@example.com", link, 40);
  await expect(member.page.getByRole("heading", { name: "You're checked in" })).toBeVisible();
  expect(await attendanceCount("qr-inside@example.com")).toBe(1);
  // The token is dropped from the address bar so a reload can't reuse it.
  expect(new URL(member.page.url()).search).toBe("");
  await member.context.close();
});

test("a valid scan from outside the geofence is rejected", async ({ page, browser }) => {
  const link = await displayedLink(page);
  const member = await scanAs(browser, "qr-forwarded@example.com", link, 5_000);
  await expect(
    member.page.getByRole("heading", { name: "You're not at church yet" }),
  ).toBeVisible();
  expect(await attendanceCount("qr-forwarded@example.com")).toBe(0);
  await member.context.close();
});

test("a tampered code is refused", async ({ page, browser }) => {
  const link = await displayedLink(page);
  const tampered = link.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  const member = await scanAs(browser, "qr-tamper@example.com", tampered, 40);
  // Either the scan page rejects its shape or the server rejects the signature.
  await expect(
    member.page.getByRole("heading", { name: /That's not a Pulse code|Scan the code/ }),
  ).toBeVisible();
  expect(await attendanceCount("qr-tamper@example.com")).toBe(0);
  await member.context.close();
});

test("a photo of the code stops working within about 60 seconds", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const link = await displayedLink(page);
  // Two full windows (30 s each) guarantee the photo's window and the next have passed.
  await page.waitForTimeout(61_000);
  const member = await scanAs(browser, "qr-photo@example.com", link, 40);
  await expect(member.page.getByRole("heading", { name: "That code has expired" })).toBeVisible();
  expect(await attendanceCount("qr-photo@example.com")).toBe(0);
  await member.context.close();
});

test("a leader can mark a member present", async ({ page, browser }) => {
  // The member exists but never checks in.
  const member = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(await member.newPage(), "qr-manual@example.com");
  await member.close();

  await signIn(page, "leader@example.com", "admin");
  await page.goto(`/admin/sessions/${await openSessionId()}`);
  const row = page.getByRole("listitem").filter({ hasText: "qr-manual@example.com" });
  await row.getByRole("button", { name: "Mark present" }).click();
  await expect(page.getByText("Tobi Adeyemi is marked present.")).toBeVisible();
  expect(await attendanceCount("qr-manual@example.com")).toBe(1);
});
