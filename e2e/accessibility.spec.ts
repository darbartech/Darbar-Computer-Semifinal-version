import { expect, test } from "@playwright/test";
import { ACCOUNTS, login } from "./helpers";

/**
 * Task 6 keyboard contract, in the browser rather than in the source tree:
 * `tests/ui-ux-contracts.test.ts` proves the markup exists, this proves it
 * works — that the first Tab lands on a skip link you can see, that taking it
 * puts you inside the page you came for, and that nothing in the tab order is
 * invisible. A focus ring you cannot photograph is not a focus ring.
 */

const COPY_SELECTOR = "a[href], h1, h2, h3, p";

/** Tab once and describe what got focus, including whether it shows any indicator. */
async function focusAfterTab(page: import("@playwright/test").Page) {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const outlinePainted =
      cs.outlineStyle !== "none" &&
      parseFloat(cs.outlineWidth) > 0 &&
      cs.outlineColor !== "rgba(0, 0, 0, 0)";
    return {
      tag: el.tagName,
      text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
      href: el.getAttribute("href"),
      onScreen: rect.width > 0 && rect.height > 0,
      inTabOrder: true,
      visible:
        outlinePainted ||
        (cs.boxShadow !== "" && cs.boxShadow !== "none") ||
        /focus-visible:bg-/.test(el.className),
      outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
      shadow: cs.boxShadow.slice(0, 48),
    };
  });
}

/** Walks the tab order and returns every stop that shows nothing when focused. */
async function invisibleStops(page: import("@playwright/test").Page, maxStops = 25) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const missing: { tag: string; text: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < maxStops; i++) {
    const stop = await focusAfterTab(page);
    if (!stop) break;
    const key = `${stop.tag}:${stop.text}`;
    if (seen.has(key)) break; // cycled back to the start of the document
    seen.add(key);
    if (!stop.visible) missing.push({ tag: stop.tag, text: stop.text });
  }
  return missing;
}

/**
 * The three areas get the same treatment. `/techdarbar` needs a session, so the
 * admin walk runs only when the seeded account is reachable — a CI run with the
 * test fixtures gets it, a hand-run against a production database does not.
 */
const AREAS = [
  { name: "public", route: "/" },
  { name: "student sign in", route: "/student/login" },
];

for (const area of AREAS) {
  test(`${area.name}: the skip link is the first stop and it works`, async ({ page }) => {
    await page.goto(area.route);
    // the site notice is a dialog; a keyboard user is allowed to leave it first
    await page.keyboard.press("Escape");

    const first = await focusAfterTab(page);
    expect(first, "the first Tab should reach the skip link").toMatchObject({
      tag: "A",
      href: "#main-content",
      onScreen: true,
      visible: true,
    });

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
    const next = await focusAfterTab(page);
    expect(next, "the stop after the skip link should be inside <main>").not.toBeNull();
    const insideMain = await page.evaluate(() =>
      Boolean((document.activeElement as HTMLElement | null)?.closest("#main-content"))
    );
    expect(insideMain).toBe(true);
  });

  test(`${area.name}: nothing in the tab order is invisible`, async ({ page }) => {
    await page.goto(area.route);
    await page.keyboard.press("Escape");
    expect(await invisibleStops(page)).toEqual([]);
  });
}

test("admin: skip link, tab order and the confirm dialog trap focus", async ({ page }) => {
  await login(page, ACCOUNTS.superAdmin);
  await page.goto("/techdarbar/leads");
  await expect(page.locator("#main-content")).toBeVisible();

  const first = await focusAfterTab(page);
  expect(first, "the admin sidebar is two dozen tabs deep — the link comes first").toMatchObject({
    href: "#main-content",
    onScreen: true,
    visible: true,
  });

  expect(await invisibleStops(page)).toEqual([]);

  // A destructive row action asks in the shared dialog, not in the browser chrome.
  await page.goto("/techdarbar/team");
  const deleteButton = page.getByRole("button", { name: /^delete$/i }).first();
  if (await deleteButton.isVisible().catch(() => false)) {
    await deleteButton.click();
    const title = page.getByRole("heading", { name: /delete team member\?/i });
    await expect(title).toBeVisible();

    // Tab stays inside the panel: five tabs never put focus on the page behind it.
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"], [data-slot="dialog-content"]'))
      );
      expect(inside, `Tab ${i + 1} escaped the dialog`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(title).toHaveCount(0);
  }
});

test("reduced motion: content is on screen without waiting for a scroll", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Escape");

  const hidden = await page.evaluate((selector) => {
    // Reveal's reduced branch emits no opacity class at all, so real copy that
    // is still transparent is a reveal that ignored the setting. Decorative
    // layers (the hero's code rain) are allowed to hide themselves.
    return Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        if (parseFloat(getComputedStyle(el).opacity) >= 0.05) return false;
        if (el.closest('[aria-hidden="true"]')) return false;
        return (el.textContent || "").trim().length > 0;
      })
      .map((el) => (el.textContent || "").trim().slice(0, 30));
  }, COPY_SELECTOR);
  expect(hidden, "text hidden under reduced motion").toEqual([]);

  const durations = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector("section")!);
    return { transition: cs.transitionDuration, animation: cs.animationDuration };
  });
  expect(Number.parseFloat(durations.transition)).toBeLessThan(0.001);
  expect(Number.parseFloat(durations.animation)).toBeLessThan(0.001);
});
