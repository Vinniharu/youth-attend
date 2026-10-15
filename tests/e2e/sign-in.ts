import { expect, test, type Page } from "@playwright/test";

import { createMember, plantSignInCode } from "./db";

/**
 * Signs in with a planted code through Better Auth's real sign-in endpoint. The
 * request shares the page's cookie jar, so the browser is then signed in. (The
 * login screen itself would ask Brevo to email a code, which E2E must not do.)
 */
export async function signIn(page: Page, email: string, role: "member" | "admin" = "member") {
  await createMember(email, role === "admin" ? "Ada Okoro" : "Tobi Adeyemi", role);
  await plantSignInCode(email, "246810");
  const baseURL = test.info().project.use.baseURL!;
  const response = await page.request.post("/api/auth/sign-in/email-otp", {
    data: { email, otp: "246810" },
    headers: { origin: baseURL },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
}
