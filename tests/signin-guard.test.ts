import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who pays for a failed sign-in (reaudit N13).
 *
 * The guard's budgets are small on purpose — five wrong passwords from one place
 * locks the account there — so deciding *which* errors count is a user-facing
 * question, not a logging detail. The stand-in below reproduces the object Better
 * Auth actually throws (probed against the installed version: `APIError` with
 * `statusCode: 401`, `body.code: "INVALID_EMAIL_OR_PASSWORD"`) next to the failures
 * our own stack produces.
 */

vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/services/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/services/email", () => ({ notifyFailedSigninBurst: vi.fn() }));
vi.mock("@/server/services/rate-limit", () => ({
  hashIp: (v: string) => v,
  isBlocked: vi.fn(),
  recordHit: vi.fn(),
}));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));

const { isCredentialRejection, createSigninGuard } = await import(
  "@/server/services/signin-guard"
);
const rateLimit = await import("@/server/services/rate-limit");
const auditService = await import("@/server/services/audit");
const {
  GENERIC_2FA_FAILURE,
  isWrongTwoFactorCode,
  twoFactorMessage,
} = await import("@/server/services/two-factor");

/** The shape of Better Auth's `APIError`, as thrown by `auth.api.signInEmail`. */
function apiError(statusCode: number, code: string, message: string) {
  return Object.assign(new Error(message), {
    name: "APIError",
    status: statusCode === 401 ? "UNAUTHORIZED" : "BAD_REQUEST",
    statusCode,
    body: { message, code },
  });
}

describe("isCredentialRejection", () => {
  it("charges the budget for a wrong password", () => {
    expect(isCredentialRejection(apiError(401, "INVALID_EMAIL_OR_PASSWORD", "Invalid email or password"))).toBe(
      true
    );
  });

  it("still charges when a wrapper strips the status but keeps the words", () => {
    expect(isCredentialRejection(new Error("Invalid email or password"))).toBe(true);
  });

  it("refuses to charge the person for our own outage", () => {
    const outages = [
      Object.assign(new Error("Can't reach database server at `localhost:5433`"), { code: "P1001" }),
      Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), { code: "P2002" }),
      Object.assign(new Error(), { statusCode: 429, body: { code: "TOO_MANY_REQUESTS" } }),
      Object.assign(new Error("User is disabled"), { statusCode: 403, body: { code: "USER_DISABLED" } }),
      new TypeError("Cannot read properties of undefined (reading 'user')"),
      "a thrown string",
      null,
      undefined,
    ];
    for (const error of outages) {
      expect(isCredentialRejection(error)).toBe(false);
    }
  });
});

/**
 * Fix guide §4: the second factor is throttled through this same guard, in its
 * own namespace. Two things have to hold — a mistyped code must not spend the
 * owner's five wrong-password attempts, and a wrong code still leaves an audit
 * row, because Better Auth counts failures but writes none of its own.
 */
describe("staff-2fa namespace", () => {
  const EMAIL = "bursar@darbar.com.np";
  const IP = "203.0.113.7";

  beforeEach(() => {
    vi.mocked(rateLimit.isBlocked).mockReset().mockResolvedValue(false);
    vi.mocked(rateLimit.recordHit).mockReset().mockResolvedValue(1);
    vi.mocked(auditService.audit).mockReset();
  });

  it("keeps its buckets separate from the password buckets", async () => {
    // `hashIp` is the identity stand-in above, so the key strings show the
    // namespace directly. Same account, same address, different bucket.
    const password = createSigninGuard("signin", EMAIL, IP);
    const secondFactor = createSigninGuard("staff-2fa", EMAIL, IP);

    await secondFactor.checkGate();
    const blockedAfter2FA = vi
      .mocked(rateLimit.isBlocked)
      .mock.calls.map(([key]) => key as string);
    expect(blockedAfter2FA.every((key) => key.startsWith("staff-2fa:"))).toBe(true);

    vi.mocked(rateLimit.isBlocked).mockClear();
    await password.checkGate();
    const blockedAfterPassword = vi
      .mocked(rateLimit.isBlocked)
      .mock.calls.map(([key]) => key as string);
    expect(blockedAfterPassword.every((key) => key.startsWith("signin:"))).toBe(true);
    expect(blockedAfterPassword.some((key) => blockedAfter2FA.includes(key))).toBe(false);
  });

  it("charges the account-plus-IP and shared IP budgets, and audits the refusal", async () => {
    const guard = createSigninGuard("staff-2fa", EMAIL, IP);
    await guard.recordFailure();

    const hits = vi.mocked(rateLimit.recordHit).mock.calls.map(([key]) => key as string);
    expect(hits).toContain(`staff-2fa:acc-ip:staff-2fa:email:${EMAIL}:${IP}`);
    expect(hits).toContain(`staff-2fa:ip:${IP}`);

    expect(auditService.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.2fa.verificationFailed",
        summary: "Failed staff two-factor verification",
        entity: "User",
      })
    );
  });

  it("audits hashed identity only — never the address, a name or a code", async () => {
    const guard = createSigninGuard("staff-2fa", EMAIL, IP);
    await guard.recordFailure();

    const params = vi.mocked(auditService.audit).mock.calls[0]![0] as {
      actor: Record<string, unknown>;
      meta?: Record<string, unknown>;
    };
    // `hashIp` is the identity stand-in here, so the values themselves prove
    // nothing. What is checked is that the row carries only the two digests.
    expect(Object.keys(params.meta ?? {}).sort()).toEqual(["account", "ipHash"]);
    expect(params.actor).toEqual({ id: null, email: "system" });
  });

  it("reports a spent account budget as a block, not as a slow-down", async () => {
    vi.mocked(rateLimit.isBlocked).mockImplementation(async (key) =>
      String(key).includes("acc-ip")
    );
    const guard = createSigninGuard("staff-2fa", EMAIL, IP);
    await expect(guard.checkGate()).resolves.toBe("account-blocked");
  });
});

/**
 * The same "who pays" question for the second factor: only a refused code is
 * charged, and the person gets told something they can act on.
 */
describe("two-factor refusals", () => {
  it("charges the budget for a wrong code or a spent backup code", () => {
    expect(isWrongTwoFactorCode(apiError(401, "INVALID_CODE", "Invalid code"))).toBe(true);
    expect(isWrongTwoFactorCode(apiError(401, "INVALID_BACKUP_CODE", "Invalid backup code"))).toBe(
      true
    );
    // A wrapper that keeps only the words must still be recognised.
    expect(isWrongTwoFactorCode(new Error("Invalid code"))).toBe(true);
  });

  it("does not charge for a wrong password, an expired challenge or an outage", () => {
    const notWrongCode = [
      apiError(400, "INVALID_PASSWORD", "Invalid password"),
      apiError(400, "TOTP_NOT_ENABLED", "TOTP not enabled"),
      apiError(400, "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE", "Too many attempts. Please request a new code."),
      apiError(429, "ACCOUNT_TEMPORARILY_LOCKED", "Too many failed verification attempts."),
      apiError(401, "INVALID_TWO_FACTOR_COOKIE", "Invalid two factor cookie"),
      Object.assign(new Error("Can't reach database server at `localhost:5433`"), { code: "P1001" }),
      new TypeError("Cannot read properties of undefined"),
    ];
    for (const error of notWrongCode) {
      expect(isWrongTwoFactorCode(error)).toBe(false);
    }
  });

  it("answers a lockout with the wait, and an unknown code with nothing useful", () => {
    expect(twoFactorMessage(apiError(429, "ACCOUNT_TEMPORARILY_LOCKED", "locked"))).toContain(
      "temporarily locked"
    );
    expect(twoFactorMessage(new Error("database is down"))).toBe(GENERIC_2FA_FAILURE);
    // An outage must never read like a refusal, or the owner thinks their code
    // was wrong and keeps trying until the account locks.
    expect(twoFactorMessage(apiError(401, "UNAUTHORIZED", "Unauthorized"))).toContain(
      "sign in again"
    );
  });
});
