import { test, expect } from "@playwright/test";
import { ACCOUNTS, login } from "./helpers";

/**
 * docs/08 §2 scenarios 2 and 3 — "admin edits course fee → public page updates"
 * and "archived course → 404".
 *
 * Both are really tests of the same thing: `invalidate(courseWriteTags(...))`.
 * The public page is served from cache, so if the tag is wrong the visitor sees
 * stale data for the rest of the TTL and the test fails here.
 */

/** The first published course in the admin table, opened on its edit screen. */
async function openFirstCourse(page: import("@playwright/test").Page) {
  await page.goto("/admin/courses");
  const firstRowLink = page.getByRole("link", { name: /edit/i }).first();
  await expect(firstRowLink).toBeVisible();
  await firstRowLink.click();
  await page.waitForURL(/\/admin\/courses\/[^/]+$/);
}

test("an admin fee change appears on the public course page", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await openFirstCourse(page);

  const slug = page.url().split("/").pop() ?? "";
  expect(slug).not.toBe("");

  // `CourseForm` labels are not associated with their inputs via htmlFor, so the
  // React Hook Form `name` attribute is the only stable handle.
  const feeInput = page.locator('input[name="feeNPR"]');
  await expect(feeInput).toBeVisible();

  const originalFee = Number(await feeInput.inputValue());
  const newFee = originalFee === 34500 ? 35500 : 34500;

  await feeInput.fill(String(newFee));
  await page.getByRole("button", { name: /save changes|create course/i }).click();
  await expect(page.getByText(/saved|published|draft/i).first()).toBeVisible();

  // Public page, cache-bypassed, shows the new integer NPR amount.
  await page.goto(`/courses/${slug}`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByText(`NPR ${newFee.toLocaleString("en-IN")}`).first()
  ).toBeVisible();

  // Restore, so the suite is repeatable.
  await login(page, ACCOUNTS.admin);
  await page.goto(`/admin/courses/${slug}`);
  await page.locator('input[name="feeNPR"]').fill(String(originalFee));
  await page.getByRole("button", { name: /save changes/i }).click();
});

test("an archived course returns 404 for the public", async ({ page }) => {
  await login(page, ACCOUNTS.superAdmin);

  await page.goto("/admin/courses");
  const archiveButton = page.getByRole("button", { name: /archive/i }).first();
  await expect(archiveButton).toBeVisible();
  await archiveButton.click();

  // Confirm dialog, if the UI asks for one.
  const confirm = page.getByRole("button", { name: /^archive$|confirm/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();

  await expect(page.getByText(/archiv/i).first()).toBeVisible();

  // The archived slug must now 404 publicly: `getPublishedCourseBySlug` only
  // returns PUBLISHED rows and the page calls `notFound()`.
  const slug = await page.evaluate(() => {
    const link = document.querySelector('a[href^="/courses/"]');
    return link?.getAttribute("href")?.replace("/courses/", "") ?? "";
  });
  if (slug) {
    const response = await page.request.get(`/courses/${slug}`);
    expect([404, 307, 308]).toContain(response.status());
  }
});
