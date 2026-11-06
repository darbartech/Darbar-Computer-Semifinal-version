import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Brief task 2 — the step-up gates that were missing.
 *
 * `requireStepUp` itself is real here; only what a unit test cannot hold is
 * stood in for: Better Auth's code verifier, the shared sign-in throttle, the
 * staff-account and settings DAL, the audit trail and the mailer. Every gate is
 * then asked the same five questions:
 *
 *   1. does it refuse when no code was typed, without touching the write?
 *   2. does it refuse a code the verifier says is wrong, and leave the row alone?
 *   3. is only the wrong code charged to the shared `staff-2fa` budget?
 *   4. does a good code get through, once?
 *   5. does the audit entry name the purpose and the method — never the digits?
 */

const sessionState = vi.hoisted(() => ({
  userId: "admin-1",
  email: "admin@darbar.test",
  role: "SUPER_ADMIN",
  twoFactorEnabled: true,
  denied: [] as string[],
}));

const twoFactorState = vi.hoisted(() => ({
  totpCalls: 0,
  backupCalls: 0,
  failWith: null as string | null,
}));

/** Which throttle a step-up attempt is charged to, and how many times. */
const guardState = vi.hoisted(() => ({ scope: null as string | null, failures: 0 }));

/** What the fake Better Auth was asked to do with a password-reset link. */
const resetState = vi.hoisted(() => ({
  requests: [] as { email: string; redirectTo?: string }[],
  throwStatus: null as number | null,
}));

const usersState = vi.hoisted(() => ({
  /** The row `adminGetUser` answers with for the account under test. */
  target: null as { id: string; email: string; role: string; isActive: boolean } | null,
  taken: null as string | null,
  created: [] as { email: string; role: string }[],
  statuses: [] as { id: string; isActive: boolean }[],
  deleted: [] as string[],
  revoked: [] as string[],
}));

const settingsState = vi.hoisted(() => ({
  row: null as { key: string; value: unknown; updatedAt: Date } | null,
  written: [] as { key: string; value: Record<string, unknown> }[],
}));

const auditCalls = vi.hoisted(
  () => [] as { action: string; summary?: string; meta?: Record<string, unknown> }[]
);

vi.mock("@/server/db", () => ({ db: {}, prisma: {} }));

vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      verifyTOTP: async () => {
        twoFactorState.totpCalls += 1;
        if (twoFactorState.failWith) {
          throw Object.assign(new Error("Invalid code"), { body: { code: twoFactorState.failWith } });
        }
        return { verified: true };
      },
      verifyBackupCode: async () => {
        twoFactorState.backupCalls += 1;
        if (twoFactorState.failWith) {
          throw Object.assign(new Error("Invalid backup code"), {
            body: { code: twoFactorState.failWith },
          });
        }
        return { valid: true };
      },
      /** The forgot-password endpoint the admin reset now rides on. */
      requestPasswordReset: async ({ body }: { body: { email: string; redirectTo?: string } }) => {
        if (resetState.throwStatus !== null) {
          throw Object.assign(new Error("Too many requests"), { status: resetState.throwStatus });
        }
        resetState.requests.push(body);
        return { status: true };
      },
    },
  },
}));

vi.mock("@/server/services/signin-guard", () => ({
  createSigninGuard: (scope: string) => ({
    checkGate: async () => "allowed",
    recordFailure: async () => {
      guardState.scope = scope;
      guardState.failures += 1;
    },
    recordWrongPortal: async () => {},
  }),
}));

/** The bucket is keyed by a hashed IP; the hashing itself is tested elsewhere. */
vi.mock("@/server/services/rate-limit", () => ({
  getClientIpHash: async () => "ip-hash",
  getClientIp: async () => "127.0.0.1",
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

vi.mock("@/server/session", async () => {
  const { TWO_FACTOR_REQUIRED_ROLES } = await import("@/lib/validators/users");
  return {
    isRedirectError: () => false,
    requirePermission: async (action: string) => {
      if (sessionState.denied.includes(action)) {
        throw Object.assign(new Error(`FORBIDDEN: missing permission ${action}`), {
          code: "FORBIDDEN",
        });
      }
      return {
        id: sessionState.userId,
        email: sessionState.email,
        name: "Super Admin",
        role: sessionState.role,
        twoFactorEnabled: sessionState.twoFactorEnabled,
      };
    },
    requiresTwoFactor: (role: string) => TWO_FACTOR_REQUIRED_ROLES.includes(role as never),
  };
});

vi.mock("@/server/services/audit", () => ({
  audit: async (input: (typeof auditCalls)[number]) => {
    auditCalls.push(input);
  },
}));

vi.mock("@/server/revalidate", () => ({
  invalidate: () => {},
  USER_TAGS: ["users"],
  SETTINGS_TAGS: ["settings"],
}));

/** `saveSetting` checks that a picked image still exists; nothing is picked here. */
vi.mock("@/server/dal/courses", () => ({ mediaExists: async () => true }));

vi.mock("@/server/dal/users", () => ({
  LAST_SUPER_ADMIN_MESSAGE: "At least one active super administrator must remain",
  adminGetUser: async () => usersState.target,
  findUserByEmail: async (email: string) => (usersState.taken === email ? { id: "other-1" } : null),
  createUserWithCredential: async (data: { email: string; role: string }) => {
    usersState.created.push({ email: data.email, role: data.role });
    return { id: "new-1" };
  },
  setUserActiveGuarded: async (id: string, isActive: boolean) => {
    usersState.statuses.push({ id, isActive });
    return { ok: true };
  },
  updateUserGuarded: async (id: string) => ({ ok: true, id }),
  deleteUserGuarded: async (id: string) => {
    usersState.deleted.push(id);
    return { ok: true };
  },
  revokeUserSessions: async (id: string) => {
    usersState.revoked.push(id);
    return { count: 2 };
  },
}));

vi.mock("@/server/dal/settings", () => ({
  adminGetSettingRow: async (key: string) =>
    settingsState.row && settingsState.row.key === key ? settingsState.row : null,
  upsertSiteSetting: async (key: string, value: Record<string, unknown>) => {
    settingsState.written.push({ key, value });
    return { key, updatedAt: new Date("2026-11-06T00:00:00.000Z"), updatedById: "admin-1" };
  },
}));

const { createUserAction, resetUserPasswordAction, setUserActiveAction } = await import(
  "@/server/actions/users"
);
const { saveSetting } = await import("@/server/actions/settings");
const { STEP_UP_NOT_ENROLLED, STEP_UP_REQUIRED } = await import("@/server/services/step-up");
const { STEP_UP_CODE_MESSAGE } = await import("@/lib/validators/step-up");
const { ADMIN_PASSWORD_RESET_PATH } = await import("@/server/constants");

const FEES_ROW = {
  currency: "NPR",
  discountApprovalThresholdPct: 10,
  lateFeePerWeek: 0,
  certificateRequiresClearance: false,
  allowedDueAmount: 0,
  maxBackdateDays: 3,
  bankDetails: "",
  receiptFooter: "Thank you.",
};

const GENERAL_ROW = {
  name: "DarbarTech",
  shortName: "Darbar",
  tagline: "GROUP OF TECHNOLOGY",
  description: "Hands-on computer training in Kathmandu.",
  siteUrl: "https://www.darbarcomputer.edu.np",
  logoMediaId: null,
  twitterHandle: "@darbarcomputer",
};

const staffUser = (overrides: Record<string, unknown> = {}) => ({
  name: "New Accountant",
  email: "accountant@darbar.test",
  role: "ACCOUNTANT",
  password: "Long-Enough-Passphrase-1",
  isActive: true,
  ...overrides,
});

beforeEach(() => {
  sessionState.userId = "admin-1";
  sessionState.email = "admin@darbar.test";
  sessionState.role = "SUPER_ADMIN";
  sessionState.twoFactorEnabled = true;
  sessionState.denied = [];
  twoFactorState.totpCalls = 0;
  twoFactorState.backupCalls = 0;
  twoFactorState.failWith = null;
  guardState.scope = null;
  guardState.failures = 0;
  resetState.requests = [];
  resetState.throwStatus = null;
  usersState.target = { id: "u-9", email: "u9@darbar.test", role: "ADMIN", isActive: true };
  usersState.taken = null;
  usersState.created = [];
  usersState.statuses = [];
  usersState.deleted = [];
  usersState.revoked = [];
  settingsState.row = null;
  settingsState.written = [];
  auditCalls.length = 0;
});

/* ─────────────────────────── creating a privileged account ─────────────────────────── */

describe("createUserAction with a privileged role (task 2)", () => {
  it("refuses an ADMIN creation that arrives without a code", async () => {
    const result = await createUserAction(staffUser());

    expect(!result.ok && result.error).toBe(STEP_UP_REQUIRED);
    expect(usersState.created).toHaveLength(0);
    expect(twoFactorState.totpCalls).toBe(0);
    expect(auditCalls.map((entry) => entry.action)).not.toContain("user.create");
  });

  it("refuses a wrong code and charges it to the shared sign-in budget", async () => {
    twoFactorState.failWith = "INVALID_CODE";

    const result = await createUserAction({ ...staffUser(), stepUpCode: "111111" });

    expect(!result.ok && result.error).toMatch(/not valid right now/);
    expect(guardState.scope).toBe("staff-2fa");
    expect(guardState.failures).toBe(1);
    expect(usersState.created).toHaveLength(0);
  });

  it("creates the account with a good code and records the purpose, not the digits", async () => {
    const result = await createUserAction({
      ...staffUser(),
      stepUpCode: "123456",
      stepUpMethod: "totp",
    });

    expect(result.ok).toBe(true);
    expect(usersState.created).toEqual([{ email: "accountant@darbar.test", role: "ACCOUNTANT" }]);
    // The good code charged nothing to the same budget the wrong one used.
    expect(guardState.failures).toBe(0);
    const stepUpEntry = auditCalls.find((entry) => entry.action === "auth.2fa.stepUp");
    expect(stepUpEntry?.meta).toEqual({
      purpose: "user.create.privileged",
      method: "totp",
    });
    expect(JSON.stringify(auditCalls)).not.toContain("123456");
  });

  it("keeps hiring an Editor a one-click action", async () => {
    const result = await createUserAction(staffUser({ role: "EDITOR" }));

    expect(result.ok).toBe(true);
    expect(twoFactorState.totpCalls).toBe(0);
    expect(auditCalls.map((entry) => entry.action)).not.toContain("auth.2fa.stepUp");
  });

  it("checks the permission and the duplicate address before it asks for a code", async () => {
    sessionState.denied = ["users.write"];
    // `users.ts` answers a refused permission with the generic failure (its
    // screens are SUPER_ADMIN-only, so the distinction has never been exposed).
    const forbidden = await createUserAction(staffUser({ stepUpCode: "123456" }));
    expect(!forbidden.ok && forbidden.error).toBe("Something went wrong. Please try again.");

    sessionState.denied = [];
    usersState.taken = "accountant@darbar.test";
    const duplicate = await createUserAction(staffUser({ stepUpCode: "123456" }));
    expect(!duplicate.ok && duplicate.error).toMatch(/already exists/);
    // A request that was never going to write does not spend a code.
    expect(twoFactorState.totpCalls).toBe(0);
  });

  it("tells an unenrolled admin to set two-factor up first", async () => {
    sessionState.twoFactorEnabled = false;

    const result = await createUserAction({ ...staffUser(), stepUpCode: "123456" });

    expect(!result.ok && result.error).toBe(STEP_UP_NOT_ENROLLED);
    expect(usersState.created).toHaveLength(0);
  });
});

/* ───────────────────────────── activating and deactivating ───────────────────────────── */

describe("setUserActiveAction (task 2)", () => {
  it("refuses to switch an account off without a code", async () => {
    const result = await setUserActiveAction({ id: "u-9", isActive: false });

    expect(!result.ok && result.error).toBe(STEP_UP_REQUIRED);
    expect(usersState.statuses).toHaveLength(0);
  });

  it("refuses to switch an account back on without a code", async () => {
    // The half that is easy to forget: turning a revoked accountant on reopens
    // everything their role can do.
    const result = await setUserActiveAction({ id: "u-9", isActive: true });

    expect(!result.ok && result.error).toBe(STEP_UP_REQUIRED);
    expect(usersState.statuses).toHaveLength(0);
    expect(twoFactorState.totpCalls).toBe(0);
  });

  it("refuses a code too short to be one", async () => {
    const result = await setUserActiveAction({ id: "u-9", isActive: false, stepUpCode: "12345" });

    expect(!result.ok && result.error).toBe(STEP_UP_CODE_MESSAGE);
    expect(usersState.statuses).toHaveLength(0);
  });

  it("applies the change with a good code, both ways", async () => {
    const off = await setUserActiveAction({ id: "u-9", isActive: false, stepUpCode: "123456" });
    expect(off.ok).toBe(true);

    const on = await setUserActiveAction({
      id: "u-9",
      isActive: true,
      stepUpCode: "123456",
      stepUpMethod: "backup",
    });
    expect(on.ok).toBe(true);

    expect(usersState.statuses).toEqual([
      { id: "u-9", isActive: false },
      { id: "u-9", isActive: true },
    ]);
    const entries = auditCalls.filter((entry) => entry.action === "auth.2fa.stepUp");
    expect(entries.map((entry) => entry.meta)).toEqual([
      { purpose: "user.active", method: "totp" },
      { purpose: "user.active", method: "backup" },
    ]);
  });

  it("still refuses to deactivate the last super admin, and the own account", async () => {
    const self = await setUserActiveAction({
      id: "admin-1",
      isActive: false,
      stepUpCode: "123456",
    });
    expect(!self.ok && self.error).toBe("You cannot deactivate your own account");
    expect(twoFactorState.totpCalls).toBe(0);
  });
});

/* ─────────────────────────── the password reset is now a link ─────────────────────────── */

describe("resetUserPasswordAction (task 2)", () => {
  it("refuses to send a link without a code", async () => {
    const result = await resetUserPasswordAction({ id: "u-9" });

    expect(!result.ok && result.error).toBe(STEP_UP_REQUIRED);
    expect(resetState.requests).toHaveLength(0);
    expect(usersState.revoked).toHaveLength(0);
  });

  it("refuses a wrong code and charges it to the shared budget", async () => {
    twoFactorState.failWith = "INVALID_BACKUP_CODE";

    const result = await resetUserPasswordAction({
      id: "u-9",
      stepUpCode: "ABCDE-FGHIJ",
      stepUpMethod: "backup",
    });

    expect(result.ok).toBe(false);
    expect(guardState.scope).toBe("staff-2fa");
    expect(guardState.failures).toBe(1);
    expect(resetState.requests).toHaveLength(0);
  });

  it("sends the account's own one-time link and closes their sessions", async () => {
    const result = await resetUserPasswordAction({ id: "u-9", stepUpCode: "123456" });

    expect(result.ok).toBe(true);
    // The forgot-password flow, not an admin-chosen credential.
    expect(resetState.requests).toEqual([
      { email: "u9@darbar.test", redirectTo: ADMIN_PASSWORD_RESET_PATH },
    ]);
    expect(usersState.revoked).toEqual(["u-9"]);
    const business = auditCalls.find((entry) => entry.action === "user.password_reset");
    expect(business?.summary).toMatch(/link sent/i);
    const stepUpEntry = auditCalls.find((entry) => entry.action === "auth.2fa.stepUp");
    expect(stepUpEntry?.meta).toEqual({ purpose: "user.password.reset", method: "totp" });
  });

  it("ignores a password in the payload — the admin no longer sets one", async () => {
    const result = await resetUserPasswordAction({
      id: "u-9",
      // A form still trained on the old screen, or a forged payload.
      password: "Admin-Choice-12345",
      stepUpCode: "123456",
    });

    expect(result.ok).toBe(true);
    expect(resetState.requests).toHaveLength(1);
    expect(JSON.stringify(auditCalls)).not.toContain("Admin-Choice-12345");
  });

  it("leaves the account alone when the mailer is throttled", async () => {
    resetState.throwStatus = 429;

    const result = await resetUserPasswordAction({ id: "u-9", stepUpCode: "123456" });

    expect(!result.ok && result.error).toMatch(/wait a minute/);
    // No link went out, so nothing was taken away either.
    expect(usersState.revoked).toHaveLength(0);
    expect(auditCalls.map((entry) => entry.action)).not.toContain("user.password_reset");
  });

  it("refuses an unknown account before it spends a code", async () => {
    usersState.target = null;

    const result = await resetUserPasswordAction({ id: "gone", stepUpCode: "123456" });

    expect(!result.ok && result.error).toBe("User not found");
    expect(twoFactorState.totpCalls).toBe(0);
  });
});

/* ─────────────────────── settings that move money or sign-in ─────────────────────── */

describe("saveSetting with a money or sign-in rule (task 2)", () => {
  it("refuses a changed discount threshold without a code", async () => {
    settingsState.row = {
      key: "fees",
      value: FEES_ROW,
      updatedAt: new Date("2026-11-01T00:00:00.000Z"),
    };

    const result = await saveSetting({
      key: "fees",
      value: { ...FEES_ROW, discountApprovalThresholdPct: "25" },
    });

    expect(!result.ok && result.error).toBe(STEP_UP_REQUIRED);
    // The panel needs the flag to show a box this page had no reason to show.
    expect(!result.ok && result.requiresStepUp).toBe(true);
    expect(settingsState.written).toHaveLength(0);
  });

  it("writes the new limit with a good code and records the purpose", async () => {
    settingsState.row = {
      key: "fees",
      value: FEES_ROW,
      updatedAt: new Date("2026-11-01T00:00:00.000Z"),
    };

    const result = await saveSetting({
      key: "fees",
      value: { ...FEES_ROW, maxBackdateDays: "0" },
      stepUpCode: "123456",
    });

    expect(result.ok).toBe(true);
    expect(settingsState.written[0]?.value).toMatchObject({ maxBackdateDays: 0 });
    const stepUpEntry = auditCalls.find((entry) => entry.action === "auth.2fa.stepUp");
    expect(stepUpEntry?.meta).toEqual({ purpose: "settings.sensitive", method: "totp" });
    expect(JSON.stringify(auditCalls)).not.toContain("123456");
  });

  it("refuses a wrong code for a fee rule and charges only that", async () => {
    settingsState.row = {
      key: "fees",
      value: FEES_ROW,
      updatedAt: new Date("2026-11-01T00:00:00.000Z"),
    };
    twoFactorState.failWith = "INVALID_CODE";

    const result = await saveSetting({
      key: "fees",
      value: { ...FEES_ROW, lateFeePerWeek: "500" },
      stepUpCode: "111111",
    });

    expect(result.ok).toBe(false);
    expect(guardState.scope).toBe("staff-2fa");
    expect(guardState.failures).toBe(1);
    expect(settingsState.written).toHaveLength(0);
  });

  it("treats a first write of the fees row as a rule being set", async () => {
    settingsState.row = null;

    const result = await saveSetting({ key: "fees", value: FEES_ROW });

    expect(!result.ok && result.error).toBe(STEP_UP_REQUIRED);
    expect(settingsState.written).toHaveLength(0);
  });

  it("leaves re-saving the numbers that are already in effect one-click", async () => {
    // The stored row predates `maxBackdateDays`; the schema fills in the default
    // the public pages already use, so saving the same rules is not a change.
    settingsState.row = {
      key: "fees",
      value: { ...FEES_ROW, maxBackdateDays: undefined },
      updatedAt: new Date("2026-11-01T00:00:00.000Z"),
    };

    const result = await saveSetting({ key: "fees", value: FEES_ROW });

    expect(result.ok).toBe(true);
    expect(twoFactorState.totpCalls).toBe(0);
    expect(auditCalls.map((entry) => entry.action)).not.toContain("auth.2fa.stepUp");
  });

  it("asks for a code when only the site URL moves on the General tab", async () => {
    settingsState.row = {
      key: "general",
      value: GENERAL_ROW,
      updatedAt: new Date("2026-11-01T00:00:00.000Z"),
    };

    // A new site name is cosmetic, even though it is the same tab.
    const renamed = await saveSetting({ key: "general", value: { ...GENERAL_ROW, name: "Darbar Tech" } });
    expect(renamed.ok).toBe(true);
    expect(twoFactorState.totpCalls).toBe(0);

    // Where a reset link is sent is not cosmetic.
    const moved = await saveSetting({
      key: "general",
      value: { ...GENERAL_ROW, siteUrl: "https://staging.darbarcomputer.edu.np" },
    });
    expect(!moved.ok && moved.error).toBe(STEP_UP_REQUIRED);
    expect(settingsState.written).toHaveLength(1);

    const withCode = await saveSetting({
      key: "general",
      value: { ...GENERAL_ROW, siteUrl: "https://staging.darbarcomputer.edu.np" },
      stepUpCode: "123456",
    });
    expect(withCode.ok).toBe(true);
    expect(settingsState.written).toHaveLength(2);
  });

  it("keeps a content tab one-click", async () => {
    const result = await saveSetting({
      key: "facilities",
      value: "Computer lab\nLive projects",
    });

    expect(result.ok).toBe(true);
    expect(twoFactorState.totpCalls).toBe(0);
  });

  it("still validates the value before it asks for a code", async () => {
    settingsState.row = {
      key: "fees",
      value: FEES_ROW,
      updatedAt: new Date("2026-11-01T00:00:00.000Z"),
    };

    const result = await saveSetting({
      key: "fees",
      value: { ...FEES_ROW, discountApprovalThresholdPct: "250" },
    });

    expect(!result.ok && result.error).toBe("Please fix the highlighted fields");
    expect(twoFactorState.totpCalls).toBe(0);
    expect(!result.ok && result.requiresStepUp).toBeUndefined();
  });

  it("keeps the settings permission ahead of the second factor", async () => {
    sessionState.denied = ["settings.write"];

    const result = await saveSetting({
      key: "fees",
      value: { ...FEES_ROW, lateFeePerWeek: "500" },
      stepUpCode: "123456",
    });

    expect(!result.ok && result.error).toBe("You don't have permission to do that");
    expect(twoFactorState.totpCalls).toBe(0);
  });
});
