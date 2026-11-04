import { expect, type Page } from "@playwright/test";

/**
 * Shared e2e helpers (docs/08 §2).
 *
 * Credentials come from the environment so they are never committed. The
 * defaults match `prisma/seed-test.ts`; override them in CI with the secrets
 * store rather than editing this file.
 */
export const ACCOUNTS = {
  superAdmin: {
    email: process.env.E2E_SUPER_ADMIN_EMAIL || "e2e-super-admin@darbar.test",
    password: process.env.E2E_SUPER_ADMIN_PASSWORD || "E2eSuperAdmin!2026",
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || "e2e-admin@darbar.test",
    password: process.env.E2E_ADMIN_PASSWORD || "E2eAdmin!2026",
  },
  editor: {
    email: process.env.E2E_EDITOR_EMAIL || "e2e-editor@darbar.test",
    password: process.env.E2E_EDITOR_PASSWORD || "E2eEditor!2026",
  },
  counselor: {
    email: process.env.E2E_COUNSELOR_EMAIL || "e2e-counselor@darbar.test",
    password: process.env.E2E_COUNSELOR_PASSWORD || "E2eCounselor!2026",
  },
} as const;

export type TestAccount = (typeof ACCOUNTS)[keyof typeof ACCOUNTS];

/** Signs in through the real login form, never by forging a cookie. */
export async function login(page: Page, account: TestAccount) {
  await page.goto("/techdarbar/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/techdarbar(?!\/login)/, { timeout: 20_000 });
}

export async function logout(page: Page) {
  await page.goto("/techdarbar");
  await page.getByRole("button", { name: /account|menu|user/i }).first().click();
  await page.getByText("Sign out").click();
  await page.waitForURL(/\/techdarbar\/login/, { timeout: 20_000 });
}

/**
 * Asserts that a URL is off-limits for the current session: either the proxy
 * bounced us to the login page, or the server redirected to /techdarbar.
 */
export async function expectBlocked(page: Page, url: string) {
  const response = await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  const finalUrl = new URL(page.url());
  expect(
    finalUrl.pathname.startsWith("/techdarbar/login") ||
      finalUrl.pathname === "/techdarbar" ||
      response?.status() === 404,
    `${url} was reachable at ${finalUrl.pathname}`
  ).toBe(true);
}

/**
 * With no `NEXT_PUBLIC_TURNSTILE_SITE_KEY` the widget renders nothing and emits
 * the development bypass token (src/components/forms/TurnstileWidget.tsx), so
 * these forms are submittable in a local run. If a real site key is set, the
 * token has to come from Cloudflare and these specs will time out — which is the
 * honest outcome rather than a silently skipped anti-spam check.
 */
export function inquiryPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "E2E Probe",
    phone: "9800000000",
    email: "e2e.probe@darbar.test",
    courseSlug: "",
    preferredBatch: "ANY",
    message: "Sent by the Playwright suite.",
    consent: true,
    website: "",
    ...overrides,
  };
}

export function contactPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "E2E Probe",
    email: "e2e.probe@darbar.test",
    phone: "",
    subject: "Playwright probe",
    organization: "",
    message: "Sent by the Playwright suite.",
    website: "",
    ...overrides,
  };
}
