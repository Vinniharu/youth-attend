import { expect, test } from "@playwright/test";

// Installability and offline behaviour (Phase 5). The service worker is built by
// `npm run build`, which the E2E web server runs.

test("manifest, icons and service worker are public", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const body = await manifest.json();
  expect(body).toMatchObject({ name: "Pulse", display: "standalone", start_url: "/" });
  expect(body.icons.map((i: { purpose: string }) => i.purpose)).toEqual(["any", "any", "maskable"]);

  for (const path of [
    ...body.icons.map((i: { src: string }) => i.src),
    "/apple-icon.png",
    "/favicon.ico",
    "/sw.js",
    "/offline",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
  }
});

test("offline: pages fall back to the offline screen; the API is never cached", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  // Wait for the worker to install (precaching /offline) and take control.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  try {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();

    const api = await page.evaluate(() =>
      fetch("/api/sessions/current").then(
        (r) => `served ${r.status}`,
        () => "network error",
      ),
    );
    expect(api).toBe("network error");
  } finally {
    // Leave the app before reconnecting: SerwistProvider reloads the page when the
    // connection returns, which would race the context teardown.
    await page.goto("about:blank").catch(() => {});
    await context.setOffline(false);
  }
});
