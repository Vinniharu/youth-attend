import { type Browser, devices, expect, type Page, test } from "@playwright/test";

import { attendanceCount, CHURCH, closeE2eDb, createPastSession, openSessionId } from "./db";
import { signIn } from "./sign-in";

// The check-in code is fixed for the whole service. What stops a shared photo is the
// geofence: a valid scan from outside it is rejected. Last week's code has expired,
// and "Reset code" kills every old copy. Members arrive the way a phone's camera app
// brings them: the code is a link to /scan?t=<token>.

const metresNorth = (m: number) => ({ latitude: CHURCH.lat + m / 111_320, longitude: CHURCH.lng });

async function displayedLink(page: Page, sessionId?: string): Promise<string> {
  await signIn(page, "leader@example.com", "admin");
  await page.goto(`/admin/sessions/${sessionId ?? (await openSessionId())}/display`);
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

test("the code stays the same all service", async ({ page }) => {
  const first = await displayedLink(page);
  await page.reload();
  await expect(page.locator("[data-qr-url]")).toHaveAttribute("data-qr-url", first);
});

test("a code from an earlier service has expired", async ({ page, browser }) => {
  const link = await displayedLink(page, await createPastSession(7));
  const member = await scanAs(browser, "qr-lastweek@example.com", link, 40);
  await expect(member.page.getByRole("heading", { name: "That code has expired" })).toBeVisible();
  expect(await attendanceCount("qr-lastweek@example.com")).toBe(0);
  await member.context.close();
});

test("'Reset code' stops old copies of the code", async ({ page, browser }) => {
  const old = await displayedLink(page);
  await page.goto(`/admin/sessions/${await openSessionId()}`);
  await page.getByRole("button", { name: "Reset code" }).click();
  await page.getByRole("button", { name: "Reset now" }).click();
  await expect(page.getByText(/New check-in code ready/)).toBeVisible();

  const member = await scanAs(browser, "qr-reset@example.com", old, 40);
  await expect(member.page.getByRole("heading", { name: "That's not a Pulse code" })).toBeVisible();
  expect(await attendanceCount("qr-reset@example.com")).toBe(0);
  await member.context.close();

  // The screen shows the new code, which works.
  const fresh = await displayedLink(page);
  expect(fresh).not.toBe(old);
  const again = await scanAs(browser, "qr-reset@example.com", fresh, 40);
  await expect(again.page.getByRole("heading", { name: "You're checked in" })).toBeVisible();
  await again.context.close();
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
