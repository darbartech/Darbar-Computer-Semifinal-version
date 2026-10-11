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

  it("does not let a client choose its own role", () => {
    // `input: false` keeps `role`/`isActive` off the public sign-in payload, so
    // a crafted request cannot escalate itself to SUPER_ADMIN.
    const additionalFields = auth.options.user?.additionalFields as
      | Record<string, { input?: boolean }>
      | undefined;
    expect(additionalFields?.role?.input).toBe(false);
    expect(additionalFields?.isActive?.input).toBe(false);
  });
});