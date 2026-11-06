import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix guide §10 — an address that already has an account used to be answered
 * with "Registration failed", which confirmed the account and skipped the
 * password hash so the response time confirmed it again.
 *
 * The action now answers both cases identically and puts the useful part — sign
 * in, or reset — in an email only the owner of that mailbox can read.
 */

const calls = vi.hoisted(() => ({
  after: [] as Array<() => Promise<unknown>>,
  hashed: [] as string[],
  created: [] as unknown[],
  audited: [] as unknown[],
  signedIn: 0,
  verificationMail: [] as string[],
  existsMail: [] as Array<{ to: string }>,
  allow: [] as Array<{ key: string; max: number; windowMinutes: number }>,
  allowResult: true,
  existingUser: null as { id: string } | null,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

vi.mock("next/server", () => ({
  // Captured, not run: the callbacks fire after the response, and the test needs
  // to see that nothing was mailed before the answer was given.
  after: (fn: () => Promise<unknown>) => {
    calls.after.push(fn);
  },
}));

vi.mock("better-auth/crypto", () => ({
  hashPassword: async (password: string) => {
    calls.hashed.push(password);
    return "credential-hash";
  },
}));

vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      sendVerificationEmail: async ({ body }: { body: { email: string } }) => {
        calls.verificationMail.push(body.email);
      },
      signInEmail: async () => {
        calls.signedIn += 1;
        return { user: { id: "user-1", role: "STUDENT" } };
      },
    },
  },
}));

vi.mock("@/server/db", () => ({
  db: {},
  prisma: { user: { update: async () => ({}) } },
}));

vi.mock("@/server/services/audit", () => ({
  audit: async (input: unknown) => {
    calls.audited.push(input);
  },
}));

vi.mock("@/server/session", () => ({
  isRedirectError: () => false,
}));

vi.mock("@/server/dal/students", () => ({
  createStudentAccount: async (data: unknown) => {
    calls.created.push(data);
    return { userId: "user-new" };
  },
}));

vi.mock("@/server/dal/users", () => ({
  findUserByEmail: async () => calls.existingUser,
}));

// `hashIdentity` stays real: the bucket key is the one place this flow touches
// the database, and it must not hold a raw address.
vi.mock("@/server/services/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/rate-limit")>();
  return {
    ...actual,
    allow: async (key: string, options: { max: number; windowMinutes: number }) => {
      calls.allow.push({ key, ...options });
      return calls.allowResult;
    },
    allowByIp: async () => true,
    getClientIp: async () => "203.0.113.9",
    getClientIpHash: async () => "ip-hash",
  };
});

vi.mock("@/server/services/email", () => ({
  sendAccountExistsEmail: async (input: { to: string }) => {
    calls.existsMail.push(input);
    return { sent: true };
  },
}));

vi.mock("@/server/services/turnstile", () => ({
  verifyTurnstile: async () => ({ success: true, errors: [] }),
}));

vi.mock("@/server/services/signin-guard", () => ({
  createSigninGuard: () => ({
    checkGate: async () => "ok",
    recordFailure: async () => {},
    recordWrongPortal: async () => {},
  }),
  isCredentialRejection: () => false,
}));

const { registerStudent } = await import("@/server/actions/student-auth");

const TAKEN_EMAIL = "existing.person@example.test";

function registrationInput(email: string) {
  return {
    name: "Ram Sharma",
    email,
    phone: "",
    password: "Zephyr-Cobalt-77",
    confirmPassword: "Zephyr-Cobalt-77",
    website: "",
    turnstileToken: "dev-turnstile-bypass",
  };
}

/** Runs the post-response callbacks the way `after()` would. */
async function flushAfter() {
  for (const fn of calls.after) await fn();
}

beforeEach(() => {
  process.env.AUTH_SECRET = "register-test-salt";
  calls.after = [];
  calls.hashed = [];
  calls.created = [];
  calls.audited = [];
  calls.signedIn = 0;
  calls.verificationMail = [];
  calls.existsMail = [];
  calls.allow = [];
  calls.allowResult = true;
  calls.existingUser = null;
});

describe("registerStudent with a taken address", () => {
  it("returns the same success a new registration gets", async () => {
    calls.existingUser = { id: "user-1" };
    const duplicate = await registerStudent(registrationInput(TAKEN_EMAIL));
    expect(duplicate).toEqual({ ok: true });
    expect(calls.created).toHaveLength(0);
    // No account was touched, so there is nothing for the audit trail to claim.
    expect(calls.audited).toHaveLength(0);
    expect(calls.signedIn).toBe(0);
  });

  it("is indistinguishable from the new-address answer", async () => {
    const fresh = await registerStudent(registrationInput("new.person@example.test"));
    calls.existingUser = { id: "user-1" };
    const duplicate = await registerStudent(registrationInput(TAKEN_EMAIL));
    expect(JSON.stringify(duplicate)).toBe(JSON.stringify(fresh));
  });

  it("hashes the password so the response time does not reveal the account", async () => {
    calls.existingUser = { id: "user-1" };
    await registerStudent(registrationInput(TAKEN_EMAIL));
    expect(calls.hashed).toEqual(["Zephyr-Cobalt-77"]);
  });

  it("mails the notice only after the response", async () => {
    calls.existingUser = { id: "user-1" };
    await registerStudent(registrationInput(TAKEN_EMAIL));
    expect(calls.existsMail).toHaveLength(0);
    await flushAfter();
    expect(calls.existsMail).toEqual([{ to: TAKEN_EMAIL }]);
  });

  it("throttles per address with a hashed key, never the raw address", async () => {
    calls.existingUser = { id: "user-1" };
    await registerStudent(registrationInput(TAKEN_EMAIL));
    await flushAfter();
    expect(calls.allow).toHaveLength(1);
    const [bucket] = calls.allow;
    expect(bucket.key.startsWith("register:exists-mail:")).toBe(true);
    expect(bucket.key).not.toContain(TAKEN_EMAIL);
    expect(bucket.key.slice("register:exists-mail:".length)).toMatch(/^[0-9a-f]{64}$/);
    expect(bucket).toMatchObject({ max: 5, windowMinutes: 60 });
  });

  it("stays silent past the fifth notice but still answers the same", async () => {
    calls.existingUser = { id: "user-1" };
    calls.allowResult = false;
    const result = await registerStudent(registrationInput(TAKEN_EMAIL));
    await flushAfter();
    expect(result).toEqual({ ok: true });
    expect(calls.existsMail).toHaveLength(0);
  });
});

describe("registerStudent with a free address", () => {
  it("still creates the account, signs in and sends the verification link", async () => {
    const result = await registerStudent(registrationInput("new.person@example.test"));
    expect(result).toEqual({ ok: true });
    expect(calls.created).toHaveLength(1);
    expect(calls.signedIn).toBe(1);
    expect(calls.audited).toHaveLength(1);
    await flushAfter();
    expect(calls.verificationMail).toEqual(["new.person@example.test"]);
    expect(calls.existsMail).toHaveLength(0);
    expect(calls.allow).toHaveLength(0);
  });
});
