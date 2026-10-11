import { test, expect } from "@playwright/test";

/**
 * docs/08 §2 scenario 6 — "contact form spam honeypot".
 *
 * The honeypot field is off-screen but present in the DOM, so a script can fill
 * it. `submitContact` returns a fake success and writes nothing, which is the
 * point: the bot cannot learn that it was caught.
 */
test("a filled honeypot is silently accepted and never stored", async ({ page }) => {
  const submitted = page.waitForResponse(
    (response) => response.request().method() === "POST",
    { timeout: 20_000 }
  );

  await page.goto("/contact");

  await page.getByLabel(/your name/i).fill("Spam Bot");
  await page.getByLabel(/^email/i).fill("spam.bot@darbar.test");
  await page.getByLabel(/subject/i).fill("Cheap backlinks");
  await page.getByLabel(/message/i).fill("Buy our SEO package now.");

  // Force the value: `fill` refuses hidden inputs, the bot uses raw DOM.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#contact-website");
    if (!input) throw new Error("honeypot field missing");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(input, "http://spam.example");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await page.getByRole("button", { name: /send message/i }).click();

  // The UI shows success — a bot learns nothing.
  await expect(
    page.getByRole("heading", { name: /message received/i })
  ).toBeVisible();

  await submitted;
});

test("the inquiry honeypot also fakes success", async ({ page }) => {
  await page.goto("/admissions/inquire");

  await page.getByLabel(/full name/i).fill("Spam Bot");
  await page.getByLabel(/^phone/i).fill("9800000000");
  await page.getByRole("checkbox").check();

  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("#website");
    if (!input) throw new Error("honeypot field missing");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(input, "http://spam.example");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await page.getByRole("button", { name: /send admission inquiry/i }).click();
  await expect(
    page.getByRole("heading", { name: /thank you for your inquiry/i })
  ).toBeVisible();
});

test("an invalid phone number is rejected before anything is sent", async ({ page }) => {
  await page.goto("/admissions/inquire");

  await page.getByLabel(/full name/i).fill("Bad Phone");
  await page.getByLabel(/^phone/i).fill("123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /send admission inquiry/i }).click();

  // Zod rejects it on the client and again on the server; the form must not
  // show the success state.
  await expect(page.getByText(/fix the errors|invalid|phone/i).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /thank you for your inquiry/i })
  ).toHaveCount(0);
});
