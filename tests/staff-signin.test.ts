import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix guide §12, item 5: who pays for a sign-in.
 *
 * `completeStaffSignIn` is the bookkeeping step behind both staff doors, and the
 * three outcomes must charge different things — a successful login charges
 * nobody (otherwise a slow colleague spends your lockout budget), a wrong
 * password charges the account-plus-IP and shared IP budgets, and a student who
 * types their own credentials into the staff form charges only the shared IP
 * budget. The buckets are observed by key, so renaming or widening what each
 * path touches fails here.
 */

const calls = vi.hoisted(() => ({
  hits: [] as string[],
  blocked: new Set<string>(),
  signOuts: 0,
  lastLogin: [] as string[],
  audits: [] as Array<{ action: string; summary: string }>,
  bursts: [] as string[],
}));

vi.mock("@/server/services/rate-limit", () => ({
  hashIp: (value: string) => `h(${value})`,
  isBlocked: async (key: string) => calls.blocked.has(key),
  recordHit: async (key: string) => {
    calls.hits.push(key);
    return calls.hits.filter((hit) => hit === key).length;
  },
}));

vi.mock("@/server/services/email", () => ({
  notifyFailedSigninBurst: async ({ ownerEmail }: { ownerEmail: string }) => {
    calls.bursts.push(ownerEmail);
    return { sent: false, reason: "test" };
  },
}));

vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));

vi.mock("@/server/auth", () => ({
  auth: { api: { signOut: async () => (calls.signOuts += 1) } },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

vi.mock("@/server/services/audit", () => ({
  audit: async (entry: { action: string; summary: string }) => {
    calls.audits.push({ action: entry.action, summary: entry.summary });
  },
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: {
      update: async ({ where }: { where: { id: string } }) => {
        calls.lastLogin.push(where.id);
        return { id: where.id };
      },
      findUnique: async ({ where }: { where: { email: string } }) => ({
        email: where.email,
      }),
      findMany: async () => [{ email: "owner@darbar.com.np" }],
    },
  },
  db: {},
}));

const { createSigninGuard } = await import("@/server/services/signin-guard");
const { completeStaffSignIn } = await import("@/server/services/staff-signin");

const EMAIL = "bursar@darbar.com.np";
const IP_HASH = "h(203.0.113.7)";

const ACCOUNT_IP = `signin:acc-ip:h(signin:email:${EMAIL}):${IP_HASH}`;
const ACCOUNT = `signin:acc:h(signin:email:${EMAIL})`;
const SHARED_IP = `signin:ip:${IP_HASH}`;

function guard() {
  return createSigninGuard("signin", EMAIL, IP_HASH);
}

beforeEach(() => {
  calls.hits = [];
  calls.blocked = new Set();
  calls.signOuts = 0;
  calls.lastLogin = [];
  calls.audits = [];
  calls.bursts = [];
});

describe("completeStaffSignIn", () => {
  it("charges nobody for a login that worked", async () => {
    const result = await completeStaffSignIn(
      { id: "user-1", email: EMAIL, role: "ACCOUNTANT", isActive: true },
      guard()
    );

    expect(result).toEqual({ ok: true, secondFactor: false });
    expect(calls.hits).toEqual([]);
    expect(calls.signOuts).toBe(0);
    expect(calls.lastLogin).toEqual(["user-1"]);
    expect(calls.audits).toEqual([{ action: "auth.signin", summary: "Signed in" }]);
  });

  it("charges only the shared IP budget for a student at the staff door", async () => {
    const result = await completeStaffSignIn(
      { id: "user-9", email: "ram.sharma@example.test", role: "STUDENT", isActive: true },
      guard()
    );

    expect(result).toEqual({ ok: false, error: "Email or password is incorrect" });
    expect(calls.hits).toEqual([SHARED_IP]);
    // The session Better Auth just created is revoked before anything renders.
    expect(calls.signOuts).toBe(1);
    expect(calls.lastLogin).toEqual([]);
    expect(calls.audits).toEqual([
      { action: "auth.signin.rejected", summary: "Signed in successfully at the wrong portal" },
    ]);
  });

  it("charges the guessing budgets for a wrong password", async () => {
    // An account with no role means Better Auth accepted nothing: the branch
    // that used to read "inactive" is the one that pays like a failed attempt.
    const result = await completeStaffSignIn(
      { id: "user-1", email: EMAIL, isActive: true },
      guard()
    );

    expect(result).toEqual({ ok: false, error: "Email or password is incorrect" });
    expect(calls.hits).toContain(ACCOUNT_IP);
    expect(calls.hits).toContain(SHARED_IP);
    expect(calls.hits).toContain(ACCOUNT);
    expect(calls.signOuts).toBe(0);
  });

  it("charges the same for a deactivated staff account", async () => {
    await completeStaffSignIn(
      { id: "user-1", email: EMAIL, role: "ADMIN", isActive: false },
      guard()
    );
    expect(calls.hits).toEqual([ACCOUNT_IP, SHARED_IP, ACCOUNT]);
    expect(calls.lastLogin).toEqual([]);
  });

  it("raises the alarm once, and only once, when an account is being sprayed", async () => {
    for (let attempt = 0; attempt < 31; attempt += 1) {
      await completeStaffSignIn({ id: "user-1", email: EMAIL, isActive: true }, guard());
    }

    expect(calls.hits.filter((hit) => hit === ACCOUNT)).toHaveLength(31);
    // The 31st hit is `max + 1`; every later one in the same window stays quiet.
    expect(calls.bursts).toEqual([EMAIL]);
  });

  it("refuses to open the staff portal on the strength of a role alone", async () => {
    // A role that cannot see the dashboard is the wrong portal, full stop.
    const result = await completeStaffSignIn(
      { id: "user-1", email: EMAIL, role: "STUDENT", isActive: true },
      guard()
    );
    expect(result.ok).toBe(false);
    expect(calls.hits).toEqual([SHARED_IP]);
  });
});

describe("createSigninGate", () => {
  it("answers the shared IP budget first, then the per-account one", async () => {
    expect(await guard().checkGate()).toBe("allowed");

    calls.blocked.add(SHARED_IP);
    expect(await guard().checkGate()).toBe("rate-limited");

    calls.blocked.delete(SHARED_IP);
    calls.blocked.add(ACCOUNT_IP);
    expect(await guard().checkGate()).toBe("account-blocked");
  });

  it("keeps the alarm budget out of the gate: spraying is not a lockout", async () => {
    calls.blocked.add(ACCOUNT);
    expect(await guard().checkGate()).toBe("allowed");
  });
});
