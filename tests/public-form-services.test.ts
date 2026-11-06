import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryRaw = vi.fn();
const bucketFindUnique = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    rateLimitBucket: { findUnique: (...args: unknown[]) => bucketFindUnique(...args) },
  },
}));

const { allow, hashIp, isBlocked, recordHit } = await import(
  "../src/server/services/rate-limit"
);
const { verifyTurnstile, getTurnstileSiteKey } = await import(
  "../src/server/services/turnstile"
);
const { TURNSTILE_DEV_BYPASS } = await import("../src/lib/validators/shared");

describe("hashIp", () => {
  it("is stable for the same input", () => {
    expect(hashIp("203.0.113.5")).toBe(hashIp("203.0.113.5"));
  });

  it("differs per address and never returns the raw IP", () => {
    const a = hashIp("203.0.113.5");
    const b = hashIp("203.0.113.6");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203.0.113.5");
  });

  it("changes with the salt", () => {
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "salt-one";
    const first = hashIp("198.51.100.1");
    process.env.AUTH_SECRET = "salt-two";
    const second = hashIp("198.51.100.1");
    process.env.AUTH_SECRET = original;
    expect(first).not.toBe(second);
  });
});

describe("allow", () => {
  beforeEach(() => {
    queryRaw.mockReset().mockResolvedValue([{ count: 1 }]);
    bucketFindUnique.mockReset().mockResolvedValue(null);
  });

  it("allows a request while the bucket is below the limit", async () => {
    queryRaw.mockResolvedValue([{ count: 5 }]);
    await expect(allow("inquiry:abc", { max: 5, windowMinutes: 60 })).resolves.toBe(true);
  });

  it("blocks the request the bucket exceeds the limit", async () => {
    // The count comes back from the increment itself, so two parallel callers
    // can never both read "4 of 5" and both pass.
    queryRaw.mockResolvedValue([{ count: 6 }]);
    await expect(allow("inquiry:abc", { max: 5, windowMinutes: 60 })).resolves.toBe(false);
  });

  it("is one statement per call, with the key bound as a parameter", async () => {
    await allow("contact:abc", { max: 5, windowMinutes: 60 });
    expect(queryRaw).toHaveBeenCalledOnce();
    const [text, ...values] = queryRaw.mock.calls[0];
    expect(String(text)).toContain("RateLimitBucket");
    expect(String(text)).toContain("ON CONFLICT");
    expect(values).toContain("contact:abc");
  });

  it("treats a missing RETURNING row as blocked rather than open", async () => {
    queryRaw.mockResolvedValue([]);
    await expect(allow("inquiry:abc", { max: 5, windowMinutes: 60 })).resolves.toBe(false);
  });
});

describe("isBlocked / recordHit", () => {
  beforeEach(() => {
    queryRaw.mockReset().mockResolvedValue([{ count: 1 }]);
    bucketFindUnique.mockReset().mockResolvedValue(null);
  });

  it("isBlocked reads the bucket without writing to it", async () => {
    bucketFindUnique.mockResolvedValue({ count: 5 });
    await expect(isBlocked("signin:acc-ip:x", 5, 15)).resolves.toBe(true);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("isBlocked lets the first attempt through when no bucket exists", async () => {
    await expect(isBlocked("signin:acc-ip:x", 5, 15)).resolves.toBe(false);
  });

  it("recordHit returns the incremented count so a caller can detect the threshold", async () => {
    queryRaw.mockResolvedValue([{ count: 31 }]);
    await expect(recordHit("signin:acc:x", 60)).resolves.toBe(31);
    expect(bucketFindUnique).not.toHaveBeenCalled();
  });
});

describe("verifyTurnstile", () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const originalSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalSecret;
    if (originalSiteKey === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalSiteKey;
  });

  it("accepts only the explicit dev token when unconfigured in dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(verifyTurnstile(TURNSTILE_DEV_BYPASS)).resolves.toEqual({
      success: true,
      errors: [],
    });
    await expect(verifyTurnstile("anything-else")).resolves.toMatchObject({
      success: false,
    });
  });

  it("fails closed when unconfigured in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = await verifyTurnstile(TURNSTILE_DEV_BYPASS);
    expect(result.success).toBe(false);
    expect(result.errors).toContain("turnstile-not-configured");
  });

  it("rejects an empty token when a secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const result = await verifyTurnstile("");
    expect(result.success).toBe(false);
    expect(result.errors).toContain("missing-input-response");
  });

  it("posts the secret, token and remote IP to Cloudflare", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

    const result = await verifyTurnstile("token", "203.0.113.5");

    expect(result).toEqual({ success: true, errors: [] });
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("token");
    expect(body.get("remoteip")).toBe("203.0.113.5");
  });

  it("surfaces Cloudflare error codes", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TURNSTILE_SECRET_KEY = "secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false, "error-codes": ["timeout-or-duplicate"] }), {
        status: 200,
      })
    );

    await expect(verifyTurnstile("token")).resolves.toEqual({
      success: false,
      errors: ["timeout-or-duplicate"],
    });
  });

  it("fails closed on a non-2xx response", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TURNSTILE_SECRET_KEY = "secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));
    await expect(verifyTurnstile("token")).resolves.toEqual({
      success: false,
      errors: ["http-503"],
    });
  });

  it("fails closed when the network throws", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TURNSTILE_SECRET_KEY = "secret";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(verifyTurnstile("token")).resolves.toEqual({
      success: false,
      errors: ["network-error"],
    });
  });

  it("exposes the public site key only when set", () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    expect(getTurnstileSiteKey()).toBeNull();
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "  ";
    expect(getTurnstileSiteKey()).toBeNull();
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    expect(getTurnstileSiteKey()).toBe("site-key");
  });
});
