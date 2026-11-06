import { describe, expect, it } from "vitest";
import { buildCsp, buildStaticCsp, createNonce, usesNoncePolicy } from "@/lib/csp";
import { readCspViolations } from "@/server/services/csp-report";

const nonce = "test-nonce-value";

describe("buildCsp", () => {
  const prod = buildCsp(nonce, false);
  const dev = buildCsp(nonce, true);

  it("carries the nonce in script-src and never falls back to unsafe-inline", () => {
    expect(prod).toContain(`script-src 'self' 'nonce-${nonce}'`);
    expect(/script-src[^;]*unsafe-inline/.test(prod)).toBe(false);
  });

  it("generates a fresh, nonce-grammar-safe value", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("keeps the deny-by-default directives", () => {
    for (const directive of [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(prod).toContain(directive);
    }
  });

  it("allows the resources the app really loads", () => {
    // The 2FA QR and the client-side previews are inline data/blob URLs.
    expect(prod).toMatch(/img-src[^;]*\bdata:/);
    expect(prod).toMatch(/img-src[^;]*\bblob:/);
    // Media library, direct upload, Turnstile, campus map.
    for (const host of [
      "https://res.cloudinary.com",
      "https://api.cloudinary.com",
      "https://challenges.cloudflare.com",
      "https://www.google.com",
    ]) {
      expect(prod).toContain(host);
    }
    expect(prod).toContain("report-uri /api/csp-report");
  });

  it("names no stock image host", () => {
    // Seeded marketing imagery is served from this origin (`/public/images/seed`),
    // so `img-src` has exactly one third party left: the media library. A stock
    // host appearing here means the seed data went back to the open web (docs/08 §1).
    for (const policy of [prod, buildStaticCsp(false)]) {
      const imgSrc = policy.match(/img-src[^;]*/)![0];
      for (const host of [
        "images.pexels.com",
        "images.unsplash.com",
        "cdn.prod.website-files.com",
      ]) {
        expect(imgSrc, `${host} is still allowed`).not.toContain(host);
      }
      expect(imgSrc.split(/\s+/).slice(1)).toEqual([
        "'self'",
        "data:",
        "blob:",
        "https://res.cloudinary.com",
      ]);
    }
  });

  it("only relaxes for the dev runtime", () => {
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).not.toContain("ws:");
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws://localhost:*");
  });

  it("is one header value, not two", () => {
    // A comma means the browser sees a second policy and enforces the stricter
    // intersection of the two.
    expect(prod).not.toContain(",");
    expect(prod.split("; ").length).toBeGreaterThan(10);
  });
});

/**
 * The split that keeps the public site prerendered (re-audit #1): a nonce is
 * only possible on a document that is rendered per request, so the two surfaces
 * get two policies and the choice is made from the path alone.
 */
describe("usesNoncePolicy", () => {
  it("covers the signed-in surfaces, including their public pages", () => {
    for (const path of [
      "/techdarbar",
      "/techdarbar/login",
      "/techdarbar/courses/123",
      "/student",
      "/student/login",
      "/student/courses",
    ]) {
      expect(usesNoncePolicy(path)).toBe(true);
    }
  });

  it("leaves the public site to the nonce-free policy", () => {
    for (const path of [
      "/",
      "/courses",
      "/courses/web-development",
      "/blog",
      "/verify/DT-CERT-2026-00001-ABCD",
      "/admissions/inquire",
    ]) {
      expect(usesNoncePolicy(path)).toBe(false);
    }
  });

  it("matches whole path segments, not prefixes", () => {
    // A prerendered `/students-of` page must not be handed a policy it cannot
    // satisfy, which would ship its bootstrap script without a nonce.
    expect(usesNoncePolicy("/student-council")).toBe(false);
    expect(usesNoncePolicy("/techdarbar-archive/2026")).toBe(false);
  });
});

describe("buildStaticCsp", () => {
  const prod = buildStaticCsp(false);
  const dev = buildStaticCsp(true);

  it("substitutes unsafe-inline for the nonce it cannot have", () => {
    expect(prod).toContain("script-src 'self' 'unsafe-inline'");
    expect(prod).not.toContain("nonce-");
  });

  it("agrees with the nonce policy on every other directive", () => {
    // The two policies differ in `script-src` and nowhere else; a directive
    // added to one and not the other would silently weaken one surface.
    const strip = (value: string) =>
      value
        .split("; ")
        .filter((directive) => !directive.startsWith("script-src"));
    expect(strip(prod)).toEqual(strip(buildCsp("any-nonce", false)));
  });

  it("only relaxes for the dev runtime", () => {
    expect(prod).not.toContain("unsafe-eval");
    expect(dev).toContain("'unsafe-eval'");
  });
});

describe("upgrade-insecure-requests", () => {
  it("is in the enforced production policy of both surfaces", () => {
    // The header is delivered as `Content-Security-Policy`, not the report-only
    // one, so the upgrade is what makes mixed-content subresources load.
    expect(buildCsp("any-nonce", false)).toContain("upgrade-insecure-requests");
    expect(buildStaticCsp(false)).toContain("upgrade-insecure-requests");
  });

  it("is absent in development, where the site is http on localhost", () => {
    expect(buildCsp("any-nonce", true)).not.toContain("upgrade-insecure-requests");
    expect(buildStaticCsp(true)).not.toContain("upgrade-insecure-requests");
  });
});

describe("readCspViolations", () => {
  it("reads the legacy report-uri envelope", () => {
    const [violation] = readCspViolations({
      "csp-report": {
        "violated-directive": "img-src http://evil.test",
        "blocked-url": "http://evil.test/pixel.png?token=abc",
        "document-url": "http://localhost:3001/courses",
      },
    });

    expect(violation).toEqual({
      directive: "img-src http://evil.test",
      blocked: "http://evil.test",
      document: "http://localhost:3001",
    });
  });

  it("reads the Reporting API array with camelCase keys", () => {
    const violations = readCspViolations([
      {
        type: "csp-violation",
        body: { effectiveDirective: "script-src", blockedURL: "inline", documentURI: "https://a.test/x" },
      },
      {
        type: "csp-violation",
        body: { effectiveDirective: "connect-src", blockedURL: "https://b.test/y", documentURI: "https://a.test/x" },
      },
    ]);

    expect(violations.map((v) => v.directive)).toEqual(["script-src", "connect-src"]);
    expect(violations[1].blocked).toBe("https://b.test");
  });

  it("keeps only the origin of a blocked URL", () => {
    const [violation] = readCspViolations({
      "csp-report": {
        "effective-directive": "img-src",
        "blocked-url": "https://cdn.test/private/phone-9800000000.jpg?sig=secret",
      },
    });

    expect(violation.blocked).toBe("https://cdn.test");
  });

  it("reads the keys a real Chrome posts", () => {
    // report-uri bodies use `-uri`, and an inline violation blocks "inline".
    const [violation] = readCspViolations({
      "csp-report": {
        "blocked-uri": "inline",
        "document-uri": "http://localhost:3001/",
        "effective-directive": "script-src-elem",
        "violated-directive": "script-src-elem 'nonce-abc' 'self'",
        "original-policy": "default-src 'self'",
        "status-code": 200,
      },
    });

    expect(violation).toEqual({
      directive: "script-src-elem 'nonce-abc' 'self'",
      blocked: "inline",
      document: "http://localhost:3001",
    });
  });

  it("survives anything that is not a report", () => {
    expect(readCspViolations(null)).toEqual([]);
    expect(readCspViolations("reflected string")).toEqual([]);
    expect(readCspViolations([1, "two", null])).toEqual([]);
    expect(readCspViolations({}).length).toBe(1);
    expect(readCspViolations({})[0].directive).toBe("unknown");
  });
});
