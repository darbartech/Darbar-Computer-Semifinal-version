import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rateLimitHit = {
  count: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
};

vi.mock("@/server/db", () => ({ db: { rateLimitHit } }));

const { allow, hashIp } = await import("../src/server/services/rate-limit");
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
    rateLimitHit.count.mockReset().mockResolvedValue(0);
    rateLimitHit.create.mockReset().mockResolvedValue({});
    rateLimitHit.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  });

  it("allows a request below the limit", async () => {
    await expect(allow("inquiry:abc", { max: 5, windowMinutes: 60 })).resolves.toBe(
      true
    );
    expect(rateLimitHit.create).toHaveBeenCalledOnce();
  });

  it("blocks once the window is full", async () => {
    rateLimitHit.count.mockResolvedValue(5);
    await expect(allow("inquiry:abc", { max: 5, windowMinutes: 60 })).resolves.toBe(
      false
    );
    expect(rateLimitHit.create).not.toHaveBeenCalled();
  });

  it("scopes the counter per key", async () => {
    await allow("contact:abc", { max: 5, windowMinutes: 60 });
    expect(rateLimitHit.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: "contact:abc" }),
      })
    );
  });

  it("still allows the request when cleanup fails", async () => {
    rateLimitHit.deleteMany.mockRejectedValue(new Error("deadlock"));
    await expect(allow("inquiry:abc", { max: 5, windowMinutes: 60 })).resolves.toBe(
      true
    );
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
