import { test, expect } from "@playwright/test";
import { ACCOUNTS, login } from "./helpers";

/**
 * docs/08 §2 scenario 1 — "visitor submits inquiry → staff sees lead".
 *
 * This is the round trip that matters most: a public Server Action write, a
 * cache invalidation, and the lead appearing in a staff-only list.
 */
test("a public inquiry reaches the staff lead list", async ({ page }) => {
  const stamp = Date.now();
  const fullName = `E2E Inquiry ${stamp}`;

  await page.goto("/admissions/inquire");

  await page.getByLabel(/full name/i).fill(fullName);
  await page.getByLabel(/^phone/i).fill("9801234567");
  await page.getByLabel(/email/i).fill("e2e.inquiry@darbar.test");
  await page.getByLabel(/message/i).fill("Automated end-to-end check.");
  await page.getByRole("checkbox").check();

  await page.getByRole("button", { name: /send admission inquiry/i }).click();

  await expect(
    page.getByRole("heading", { name: /thank you for your inquiry/i })
  ).toBeVisible();

  // Staff side: the lead must be there without a redeploy.
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/leads");

  await expect(
    page.getByRole("heading", { name: /leads/i }).first()
  ).toBeVisible();

  await page.getByRole("link", { name: fullName }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(fullName) })
  ).toBeVisible();
});
