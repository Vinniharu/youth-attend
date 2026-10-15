import { expect, test } from "@playwright/test";

import { closeE2eDb, plantSignInCode, userByEmail } from "./db";

// Self sign-up: an email nobody added signs in with a code, which creates the
// account; the welcome step asks for a name (and optional phone), then home.

test.afterAll(closeE2eDb);

test("a new member creates an account and adds their name", async ({ page }) => {
  const email = "brand-new@example.com";
  expect(await userByEmail(email)).toBeNull();

  // The planted code stands in for the emailed one (E2E never sends email).
  await plantSignInCode(email, "135790");
  const response = await page.request.post("/api/auth/sign-in/email-otp", {
    data: { email, otp: "135790" },
    headers: { origin: test.info().project.use.baseURL! },
  });
  expect(response.ok()).toBe(true);

  // Anywhere in the app sends a nameless account to the welcome step first.
  await page.goto("/history");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { name: "Welcome to Pulse" })).toBeVisible();

  await page.getByLabel("Full name").fill("Kemi Bello");
  await page.getByLabel("Phone (optional)").fill("+234 801 234 5678");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Kemi/).first()).toBeVisible();
  expect(await userByEmail(email)).toEqual({
    name: "Kemi Bello",
    phone: "+234 801 234 5678",
    role: "member",
  });

  // Done once: /welcome now goes straight home.
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/$/);
});

test("the login page invites new members to join", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in or join" })).toBeVisible();
  await expect(page.getByText(/The same code creates your account/)).toBeVisible();
});
