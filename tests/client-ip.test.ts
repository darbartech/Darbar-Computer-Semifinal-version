import { describe, it, expect, afterEach } from "vitest";
import { clientIpFromHeaders, trustedProxyMode } from "../src/server/services/rate-limit";

/**
 * S1 of the security doc: the client address must not be forgeable, because every
 * rate limit is keyed by it. These tests are the whole point of the change —
 * a spoofed `CF-Connecting-IP` used to be trusted unconditionally.
 */
function headersFrom(init: Record<string, string>): Headers {
  return new Headers(init);
}

const originalMode = process.env.TRUSTED_PROXY;
const originalHops = process.env.TRUSTED_PROXY_HOPS;

afterEach(() => {
  if (originalMode === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = originalMode;
  if (originalHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = originalHops;
});

describe("trustedProxyMode", () => {
  it("defaults to hops, the safe reading", () => {
    delete process.env.TRUSTED_PROXY;
    expect(trustedProxyMode()).toBe("hops");
  });

  it("only says cloudflare for that exact value", () => {
    process.env.TRUSTED_PROXY = "  CloudFlare  ";
    expect(trustedProxyMode()).toBe("cloudflare");
    process.env.TRUSTED_PROXY = "cf";
    expect(trustedProxyMode()).toBe("hops");
  });
});

describe("clientIpFromHeaders in hops mode", () => {
  it("ignores a spoofed CF-Connecting-IP", () => {
    process.env.TRUSTED_PROXY = "hops";
    const h = headersFrom({
      "cf-connecting-ip": "1.2.3.4",
      "x-forwarded-for": "9.9.9.9, 203.0.113.7",
    });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.7");
  });

  it("takes the right-most hop, which our own proxy appended", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    expect(
      clientIpFromHeaders(headersFrom({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" }))
    ).toBe("203.0.113.9");
  });

  it("walks one further left per additional trusted proxy", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(
      clientIpFromHeaders(headersFrom({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" }))
    ).toBe("2.2.2.2");
  });

  it("returns no identity when the chain is shorter than the trusted proxies", () => {
    // The request did not pass through the expected proxies, so anything it
    // claims about its address is worthless.
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIpFromHeaders(headersFrom({ "x-forwarded-for": "203.0.113.9" }))).toBeNull();
  });

  it("falls back to X-Real-IP, which only our proxy can set", () => {
    expect(clientIpFromHeaders(headersFrom({ "x-real-ip": " 203.0.113.5 " }))).toBe("203.0.113.5");
  });

  it("returns null with no address at all", () => {
    expect(clientIpFromHeaders(headersFrom({}))).toBeNull();
    expect(clientIpFromHeaders(headersFrom({ "x-forwarded-for": " ,  " }))).toBeNull();
  });
});

describe("clientIpFromHeaders in cloudflare mode", () => {
  it("uses CF-Connecting-IP once the operator declares Cloudflare in front", () => {
    process.env.TRUSTED_PROXY = "cloudflare";
    expect(
      clientIpFromHeaders(
        headersFrom({ "cf-connecting-ip": "203.0.113.4", "x-forwarded-for": "1.1.1.1" })
      )
    ).toBe("203.0.113.4");
  });

  it("does not fall back to a forgeable header, so the bucket stays unidentified", () => {
    process.env.TRUSTED_PROXY = "cloudflare";
    expect(clientIpFromHeaders(headersFrom({ "x-forwarded-for": "1.1.1.1" }))).toBeNull();
  });
});
