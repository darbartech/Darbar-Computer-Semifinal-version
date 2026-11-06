import { describe, expect, it } from "vitest";

/**
 * Guards the two auth-config settings that docs/02 §4 and docs/08 §1 require
 * and that no UI test can catch:
 *
 *   1. public sign-up is disabled — staff exist only via the seed script or a
 *      SUPER_ADMIN, never via `/api/auth/sign-up/email`;
 *   2. passwords are at least 10 characters.
 *
 * Both are read from the live Better Auth instance. The sign-up check runs
 * before any database access, so no Postgres is needed.
 */
import { auth } from "../src/server/auth";

describe("auth configuration", () => {
  it("has public sign-up disabled", async () => {
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
  });

  it("rejects a public sign-up request before it touches the database", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          email: "attacker@example.com",
          password: "a-very-long-password",
          name: "Not A Staff Member",
        },
      })
    ).rejects.toThrow(/sign up is not enabled/i);
  });

  it("enables email and password sign-in", () => {
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
  });

  it("requires a minimum password length of 10", () => {
    expect(auth.options.emailAndPassword?.minPasswordLength).toBe(10);
  });

  it("uses database sessions so a deactivated user can be revoked immediately", () => {
    // docs/08 §1: a deactivated user must be rejected on every request. That is
    // only possible while the session lives in the database.
    expect(auth.options.session?.cookieCache?.enabled ?? false).toBe(false);
  });

  it("throttles login attempts", () => {
    expect(auth.options.rateLimit?.enabled).toBe(true);
    expect(auth.options.rateLimit?.customRules?.["/sign-in/email"]).toBeDefined();
  });

  it("confirms a student email before the portal opens (docs 01 §S3)", () => {
    // The library must not gate sign-in itself — staff have no verification and
    // `requireStudent()` is the actual gate. What the config has to provide is
    // the sender and a short-lived token.
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(false);
    expect(auth.options.emailVerification?.sendVerificationEmail).toBeTypeOf("function");
    expect(auth.options.emailVerification?.sendOnSignUp).toBe(false);
    expect(auth.options.emailVerification?.expiresIn).toBe(3600);
    expect(auth.options.rateLimit?.customRules?.["/send-verification-email"]).toBeDefined();
  });

  it("does not let a client choose its own role", () => {
    // `input: false` keeps `role`/`isActive` off the public sign-in payload, so
    // a crafted request cannot escalate itself to SUPER_ADMIN.
    const additionalFields = auth.options.user?.additionalFields as
      | Record<string, { input?: boolean }>
      | undefined;
    expect(additionalFields?.role?.input).toBe(false);
    expect(additionalFields?.isActive?.input).toBe(false);
  });

  it("mounts the staff two-factor plugin ahead of the cookie plugin (fix guide §4)", () => {
    const plugins = (auth.options.plugins ?? []) as { id: string }[];
    const ids = plugins.map((plugin) => plugin.id);
    expect(ids).toContain("two-factor");
    // nextCookies() writes the queued cookies from Server Actions in its own
    // after-hook, so it has to run last or the two-factor challenge cookie set
    // during sign-in would never reach the browser.
    expect(ids[ids.length - 1]).toBe("next-cookies");
    expect(ids.indexOf("two-factor")).toBeLessThan(ids.indexOf("next-cookies"));
  });

  it("exposes the two-factor calls the server actions use", () => {
    // The HTTP surface stays allow-listed, so these are reachable only through
    // `auth.api.*`. If the plugin ever stops registering them, the account page
    // and the login code step break together.
    for (const method of [
      "enableTwoFactor",
      "disableTwoFactor",
      "verifyTOTP",
      "verifyBackupCode",
    ] as const) {
      expect(auth.api[method], method).toBeTypeOf("function");
    }
  });

  it("locks an account after repeated wrong codes, not after thousands", () => {
    // The plugin's own challenge budget is five; this is the account-wide one.
    // It has to be finite, or a leaked secret can be ground through forever.
    const twoFactorPlugin = (auth.options.plugins as { id: string; options?: {
      accountLockout?: { enabled?: boolean; maxFailedAttempts?: number; durationSeconds?: number };
      issuer?: string;
    } }[]).find((plugin) => plugin.id === "two-factor");
    expect(twoFactorPlugin?.options?.issuer).toBe("DarbarTech Admin");
    expect(twoFactorPlugin?.options?.accountLockout).toMatchObject({
      enabled: true,
      maxFailedAttempts: 5,
      durationSeconds: 900,
    });
  });
});