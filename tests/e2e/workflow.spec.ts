import { expect, test } from "@playwright/test";

import { closeE2eDb, createMember, createYesterdaysSession, setHistory, userState } from "./db";
import { signIn } from "./sign-in";

// Phase 8 done-when: an admin can run a full Sunday and the follow-up workflow
// without touching the database. (The database is only used here to set up history
// and to check the results.) Uses its own session for yesterday, so it doesn't
// disturb today's open session used by the other specs.

test.afterAll(closeE2eDb);

test("a leader runs a Sunday end to end, then the follow-up", async ({ page }) => {
  test.setTimeout(120_000);
  // Setup: two regulars, one of whom has already missed two Sundays.
  await createMember("drifting@example.com", "Drifting Dayo");
  await setHistory("drifting@example.com", 2);
  await createMember("travelling@example.com", "Travelling Tunde");
  await setHistory("travelling@example.com", 0);
  const sessionId = await createYesterdaysSession();

  await signIn(page, "workflow-leader@example.com", "admin");

  // 1. Add a new member through the members page.
  await page.goto("/admin/members");
  await page.getByRole("button", { name: "Add member" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("Grace Okon");
  await dialog.getByLabel("Email").fill("grace@example.com");
  await dialog.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("Grace Okon added.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Grace Okon/ })).toBeVisible();

  // 2. On the session: mark Grace present, excuse Tunde.
  await page.goto(`/admin/sessions/${sessionId}`);
  const row = (email: string) => page.getByRole("listitem").filter({ hasText: email });
  await row("grace@example.com").getByRole("button", { name: "Mark present" }).click();
  await expect(page.getByText("Grace Okon is marked present.")).toBeVisible();
  // Search first, as a leader would on a long list. It also keeps the row away from
  // the bottom of the phone viewport, where the toast (paused while hovered) sits.
  await page.getByLabel("Search members").fill("travelling");
  await row("travelling@example.com").getByRole("button", { name: "Excuse" }).click();
  await page.getByLabel("Reason Travelling Tunde is excused").fill("Travelling with family");
  await row("travelling@example.com").getByRole("button", { name: "Excuse" }).last().click();
  await expect(page.getByText("Travelling Tunde is excused.")).toBeVisible();

  // 3. Close check-in from the sessions list.
  await page.goto("/admin/sessions");
  const sessionRow = page
    .getByRole("listitem")
    .filter({ has: page.locator(`a[href="/admin/sessions/${sessionId}"]`) });
  await sessionRow.getByRole("button", { name: "Manage" }).click();
  await page.getByRole("button", { name: "Close check-in" }).click();
  await expect(page.getByText("Check-in is closed.")).toBeVisible();

  // 4. Process absences now.
  await page.goto(`/admin/sessions/${sessionId}`);
  await page.getByRole("button", { name: "Process absences now" }).click();
  await expect(page.getByText(/Processed: \d+ absent, \d+ newly flagged/)).toBeVisible();
  expect(await userState("drifting@example.com")).toMatchObject({
    consecutive_absences: 3,
    is_flagged: true,
    open_follow_ups: "1",
  });
  expect(await userState("travelling@example.com")).toMatchObject({ consecutive_absences: 0 });

  // 5. The follow-up shows up first on the dashboard; note, assign, resolve.
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: /Drifting Dayo/ })).toBeVisible();
  await page.goto("/admin/follow-ups");
  const card = page.getByRole("article").filter({ hasText: "Drifting Dayo" });
  await card.getByLabel("Notes").fill("Called on Monday, exams. Back next week.");
  await card.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes saved.")).toBeVisible();
  await card.getByLabel("Leader").selectOption({ label: "Ada Okoro" });
  await expect(page.getByText("Leader assigned.")).toBeVisible();
  await card.getByRole("button", { name: "Mark resolved" }).click();
  await card.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("Drifting Dayo's follow-up is resolved.")).toBeVisible();

  expect(await userState("drifting@example.com")).toMatchObject({
    is_flagged: false,
    open_follow_ups: "0",
  });
});
