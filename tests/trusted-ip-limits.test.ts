import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * reaudit N2 — one public address is one building.
 *
 * The institute's lab, the front desk and every phone on the Wi-Fi leave through
 * the same IP, so a counter keyed by address is a quota for the whole campus.
 * These tests cover the two halves of the fix: a listed campus address takes no
 * slot at all, and an address that only *claims* to be on the list still pays.
 */

const queryRaw = vi.fn();
let requestHeaders = new Headers();

vi.mock("@/server/db", () => ({
  db: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    rateLimitBucket: { findUnique: async () => null },
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
}));

const { trustedIpList, isTrustedClientIp, allowByIp } = await import(
  "../src/server/services/rate-limit"
);

const CAMPUS = { max: 40, windowMinutes: 60 };

const originalTrusted = process.env.RATE_LIMIT_TRUSTED_IPS;
const originalProxy = process.env.TRUSTED_PROXY;
const originalHops = process.env.TRUSTED_PROXY_HOPS;

function from(ip: string) {
  requestHeaders = new Headers({ "x-forwarded-for": ip });
}

beforeEach(() => {
  queryRaw.mockReset().mockResolvedValue([{ count: 1 }]);
  process.env.TRUSTED_PROXY = "hops";
  process.env.TRUSTED_PROXY_HOPS = "1";
  delete process.env.RATE_LIMIT_TRUSTED_IPS;
  from("203.0.113.50");
});

afterEach(() => {
  if (originalTrusted === undefined) delete process.env.RATE_LIMIT_TRUSTED_IPS;
  else process.env.RATE_LIMIT_TRUSTED_IPS = originalTrusted;
  if (originalProxy === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = originalProxy;
  if (originalHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = originalHops;
  requestHeaders = new Headers();
});

describe("trustedIpList", () => {
  it("is empty when the operator has declared no campus address", () => {
    expect(trustedIpList()).toEqual([]);
    process.env.RATE_LIMIT_TRUSTED_IPS = "   ";
    expect(trustedIpList()).toEqual([]);
  });

  it("tolerates the spacing a human types into an env file", () => {
    process.env.RATE_LIMIT_TRUSTED_IPS = " 203.0.113.10, 202.79.32.5 ,";
    expect(trustedIpList()).toEqual(["203.0.113.10", "202.79.32.5"]);
  });
});

describe("isTrustedClientIp", () => {
  it("matches the address exactly", async () => {
    process.env.RATE_LIMIT_TRUSTED_IPS = "203.0.113.10";
    from("203.0.113.10");
    await expect(isTrustedClientIp()).resolves.toBe(true);
    from("203.0.113.11");
    await expect(isTrustedClientIp()).resolves.toBe(false);
  });

  it("is false for everyone when the list is unset", async () => {
    await expect(isTrustedClientIp()).resolves.toBe(false);
  });

  it("ignores a spoofed hop that merely mentions a campus address", async () => {
    // X-Forwarded-For is a hop list whose left-hand entries the caller writes.
    // Only the address our own proxy appended can be trusted.
    process.env.RATE_LIMIT_TRUSTED_IPS = "203.0.113.10";
    from("203.0.113.10, 198.51.100.77");
    await expect(isTrustedClientIp()).resolves.toBe(false);
  });

  it("refuses the exemption with no client identity at all", async () => {
    process.env.RATE_LIMIT_TRUSTED_IPS = "203.0.113.10";
    requestHeaders = new Headers();
    await expect(isTrustedClientIp()).resolves.toBe(false);
  });
});

describe("allowByIp", () => {
  it("never takes a slot for a campus address", async () => {
    // The finding's actual failure: the sixth student on campus Wi-Fi could not
    // register. With the campus address listed, the queue writes no bucket, so
    // however many students follow one another none of them inherits a count.
    process.env.RATE_LIMIT_TRUSTED_IPS = "203.0.113.10";
    from("203.0.113.10");
    for (let i = 0; i < 60; i++) {
      await expect(allowByIp("register:ip:campus", CAMPUS)).resolves.toBe(true);
    }
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("still counts every other address and refuses past the budget", async () => {
    process.env.RATE_LIMIT_TRUSTED_IPS = "203.0.113.10";
    from("198.51.100.4");
    queryRaw.mockResolvedValue([{ count: 40 }]);
    await expect(allowByIp("register:ip:visitor", CAMPUS)).resolves.toBe(true);
    queryRaw.mockResolvedValue([{ count: 41 }]);
    await expect(allowByIp("register:ip:visitor", CAMPUS)).resolves.toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("keeps the counter warm for a trusted address that is removed later", async () => {
    // The exemption is a policy switch, not a data fix: a bucket another campus
    // visitor already filled must still be in force the hour the list is emptied.
    from("203.0.113.10");
    process.env.RATE_LIMIT_TRUSTED_IPS = "203.0.113.10";
    await allowByIp("inquiry:abc", CAMPUS);
    expect(queryRaw).not.toHaveBeenCalled();

    delete process.env.RATE_LIMIT_TRUSTED_IPS;
    queryRaw.mockResolvedValue([{ count: 41 }]);
    await expect(allowByIp("inquiry:abc", CAMPUS)).resolves.toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
