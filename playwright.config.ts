import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration (docs/08 §2 "Testing plan").
 *
 * `E2E_BASE_URL` lets CI point at a preview build instead of starting a server.
 * Locally the dev server is reused so a full `next build` is not needed for
 * every run — but note the dev server hits PostgreSQL, so the database must be
 * reachable (see `prisma/seed-test.ts` for the fixtures, which also enrolls the
 * gated roles with a test-only authenticator).
 */
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3001";
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  // Traces, screenshots and the attachments that go with them, in one place —
  // `/test-results/` is gitignored, so nothing from a failing run escapes.
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The mobile project owns the viewport smoke tests (docs/08 §2 scenario 7);
      // running them here too would just duplicate the work.
      testIgnore: /mobile-smoke\.spec\.ts/,
    },
    {
      // docs/08 §2 scenario 7: a mobile viewport smoke test.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile-smoke\.spec\.ts/,
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
