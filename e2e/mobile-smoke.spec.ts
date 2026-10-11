import { test, expect } from "@playwright/test";

/**
 * docs/08 §2 scenario 7 — "mobile viewport smoke".
 *
 * Runs only in the `mobile` project (Pixel 7, see playwright.config.ts). This is
 * a smoke test, not a visual-regression suite: it asserts that nothing overflows
 * horizontally and that the primary navigation is reachable by touch.
 */
const PUBLIC_PAGES = ["/", "/courses", "/contact", "/admissions/inquire"];

for (const path of PUBLIC_PAGES) {
  test(`${path} renders on a phone without sideways scrolling`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading").first()
    ).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // One pixel of slack for sub-pixel rounding on fractional layouts.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
}

test("the mobile navigation opens", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const menuButton = page.getByRole("button", { name: /menu|navigation|open/i }).first();
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  await expect(page.getByRole("link", { name: /^courses$/i }).first()).toBeVisible();
});

test("the WhatsApp button stays tappable", async ({ page }) => {
  await page.goto("/contact", { waitUntil: "domcontentloaded" });
  const whatsapp = page.locator('a[href*="wa.me"]').first();
  await expect(whatsapp).toBeVisible();
});
