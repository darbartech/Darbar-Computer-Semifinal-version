import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildReport, createReporter, reportRoute, scrubText } from "@/lib/error-report";

/**
 * Task 9a — error monitoring.
 *
 * Two things are being tested and only one of them is the transport. The other
 * is the rule that outranks it: a crash report on this site is built from an
 * exception whose message a form put there, so the payload can carry an email
 * address, a phone number, an invoice note and — because `requireStepUp` reads
 * the code out of the same object everything else is read from — a six-digit
 * 2FA code. The vendor's own scrubbing is a black box from this repository, so
 * the strings are cleaned here, first, and the tests below are written against
 * the worst payload that can be constructed, not against a tidy stack trace.
 */

describe("scrubText", () => {
  it("redacts anything that reads like a credential field", () => {
    expect(scrubText('failed for {"stepUpCode":"123456","method":"totp"}')).toBe(
      'failed for {"stepUpCode":"[redacted]","method":"totp"}'
    );
    expect(scrubText("bad code=904312 in payload")).toBe("bad code=[redacted] in payload");
    expect(scrubText("password=Hunter2!&totp=654321")).toBe(
      "password=[redacted]&totp=[redacted]"
    );
    expect(scrubText("Authorization: Bearer eyJhbGciOi")).toBe(
      "Authorization: [redacted]"
    );
  });

  it("redacts addresses and phone-shaped digit runs", () => {
    expect(scrubText("no such student: ramesh.shrestha@example.com")).toBe(
      "no such student: [email]"
    );
    expect(scrubText("duplicate lead +977-984 1234567")).toBe("duplicate lead [number]");
    expect(scrubText("contacted 9841234567 twice")).toBe("contacted [number] twice");
  });

  it("leaves numbers that are not contact details alone", () => {
    // Line and column numbers are how a stack is read; a Nepali date or an
    // amount of rupees is not personal data either.
    expect(scrubText("at recordPayment (src/server/dal/fees.ts:412:23)")).toBe(
      "at recordPayment (src/server/dal/fees.ts:412:23)"
    );
    expect(scrubText("invoice 105000 NPR")).toBe("invoice 105000 NPR");
  });

  it("is a no-op on the ordinary message", () => {
    expect(scrubText("Unique constraint failed on the fields: (`paymentReference`)")).toBe(
      "Unique constraint failed on the fields: (`paymentReference`)"
    );
  });
});

describe("reportRoute", () => {
  it("drops the query string, which is where the search boxes put phone numbers", () => {
    expect(reportRoute("/techdarbar/students?q=%2B9779841234567&page=2")).toBe(
      "/techdarbar/students"
    );
    expect(reportRoute("/blog#comment-form")).toBe("/blog");
    expect(reportRoute("/")).toBe("/");
  });
});

describe("buildReport", () => {
  it("scrubs and caps what an Error carries", () => {
    const error = new Error(`cannot reach ${"x".repeat(900)}`);
    error.name = "PaymentWriteError";
    const report = buildReport({
      surface: "server",
      where: "recordPaymentAction",
      error,
      route: "/techdarbar/fees?email=student@example.com",
      occurredAt: new Date("2026-11-06T04:00:00.000Z"),
    });

    expect(report).toMatchObject({
      surface: "server",
      where: "recordPaymentAction",
      name: "PaymentWriteError",
      route: "/techdarbar/fees",
      occurredAt: "2026-11-06T04:00:00.000Z",
    });
    // Capped, and capped at the front so the beginning of the message — the
    // part that says what failed — is the part that survives.
    expect(report.message).toHaveLength(501);
    expect(report.message).toMatch(/^cannot reach x+…$/);
    expect(report.stack).toMatch(/^PaymentWriteError: cannot reach/);
  });

  it("treats a thrown string or object as the untrusted text it is", () => {
    // The `email=` label is part of the message and stays; the address that a
    // form put there does not.
    expect(
      buildReport({ surface: "client", where: "x", error: "email=boy@school.edu" }).message
    ).toBe("email=[email]");

    const thrown = buildReport({ surface: "server", where: "x", error: { a: 1 } });
    expect(thrown.message).toBe("non-error thrown value");
    expect(thrown.name).toBe("object");
  });

  it("keeps Next's digest, which is the only way to tie a page to a report", () => {
    const error = new Error("render failed") as Error & { digest?: string };
    error.digest = "291837465";
    const report = buildReport({ surface: "server", where: "RSC render", error });
    expect(report.message).toBe("render failed [digest=291837465]");
  });

  it("will not let a label smuggle personal data either", () => {
    expect(
      buildReport({
        surface: "server",
        where: "settings.sensitive for admin@example.com code=112233",
        error: new Error("no"),
      }).where
    ).toBe("settings.sensitive for [email] code=[redacted]");
  });
});

describe("createReporter", () => {
  const report = buildReport({ surface: "server", where: "x", error: new Error("boom") });

  it("does nothing at all when nobody configured an endpoint", async () => {
    const fetchImpl = vi.fn();
    const reporter = createReporter({ endpoint: "", fetchImpl });
    expect(reporter.enabled).toBe(false);
    await expect(reporter.report(report)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the report when one is configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const reporter = createReporter({
      endpoint: "https://collector.example.test/ingest/abc",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(reporter.report(report)).resolves.toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as [
      string,
      { method: string; body: string; headers: Record<string, string>; keepalive: boolean },
    ];
    expect(url).toBe("https://collector.example.test/ingest/abc");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    // A report sent during an unload still has to leave.
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toMatchObject({ message: "boom", surface: "server" });
  });

  it("stops after the budget, so a broken dependency cannot flood a vendor", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    let clock = 0;
    const reporter = createReporter({
      endpoint: "https://collector.example.test/ingest/abc",
      budget: { max: 3, windowMinutes: 10 },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => clock,
    });

    for (let i = 0; i < 6; i += 1) await reporter.report(report);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    // A new window is a fresh budget: monitoring is meant to keep running.
    clock = 10 * 60_000;
    await expect(reporter.report(report)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("never throws, whatever the transport does", async () => {
    const reporter = createReporter({
      endpoint: "https://collector.example.test/ingest/abc",
      fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch,
    });
    await expect(reporter.report(report)).resolves.toBe(false);

    // A transport that throws before it returns a promise is the same story:
    // the caller is a request that is already failing, and a second failure on
    // top of it would be the one that escapes to the visitor.
    const throws = vi.fn(() => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;
    await expect(
      createReporter({ endpoint: "https://collector.example.test/x", fetchImpl: throws }).report(
        report
      )
    ).resolves.toBe(false);
  });
});

/* ─────────────── the ingest endpoint ─────────────── */

const ingest = vi.hoisted(() => ({
  allow: true,
  forwarded: [] as unknown[],
  declaredLimit: 0,
}));

vi.mock("@/server/services/rate-limit", () => ({
  allow: async () => ingest.allow,
  getClientIpHash: async () => "ip-hash",
}));

vi.mock("@/server/services/monitoring", () => ({
  reportError: () => {},
  reportClientError: (body: unknown) => {
    ingest.forwarded.push(body);
    ingest.declaredLimit += 1;
  },
}));

const { POST } = await import("@/app/api/error-report/route");

function posted(body: unknown, contentLength?: string) {
  return new Request("http://localhost/api/error-report", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(contentLength ? { "content-length": contentLength } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  ingest.allow = true;
  ingest.forwarded = [];
  ingest.declaredLimit = 0;
});

describe("POST /api/error-report", () => {
  it("answers 204 and forwards", async () => {
    const response = await POST(
      posted({ surface: "client", where: "window.onerror", message: "boom", name: "Error" })
    );
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(ingest.forwarded).toHaveLength(1);
  });

  it("is the same 204 for garbage, for nothing, and for an over-sized body", async () => {
    expect((await POST(posted("not json at all"))).status).toBe(204);
    expect(ingest.forwarded).toHaveLength(0);

    expect((await POST(posted({ message: "x" }, "40000"))).status).toBe(204);
    // The declared length is checked before the limiter is spent, and before the
    // body is read: a flood of oversized posts must not cost a database write.
    expect(ingest.declaredLimit).toBe(0);

    expect((await POST(posted({ nope: true }))).status).toBe(204);
    expect(ingest.declaredLimit).toBe(1);
  });

  it("says nothing different when the address is over its limit", async () => {
    ingest.allow = false;
    const response = await POST(posted({ message: "boom" }));
    expect(response.status).toBe(204);
    expect(ingest.forwarded).toHaveLength(0);
  });
});

/* ─────────────── how it is wired in ─────────────── */

const { readFileSync } = await import("node:fs");
const { join } = await import("node:path");
const read = (parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("wiring", () => {
  it("reports what Next hands the server, without reading the headers", () => {
    const source = read(["src", "instrumentation.ts"]);
    expect(source).toMatch(/export const onRequestError/);
    expect(source).toMatch(/reportRequestError/);
    // `request.headers` is the session cookie.
    expect(source).not.toMatch(/request\.headers/);
  });

  it("installs browser listeners only behind an env flag", () => {
    const source = read(["src", "instrumentation-client.ts"]);
    expect(source).toMatch(/NEXT_PUBLIC_ERROR_REPORT_ENDPOINT\?\.trim\(\)/);
    expect(source).toMatch(/addEventListener\("error"/);
    expect(source).toMatch(/addEventListener\("unhandledrejection"/);
    // Nothing in a browser bundle may reach the collector's own URL or token.
    expect(source).not.toContain("ERROR_REPORT_ENDPOINT\"");
    expect(source).not.toMatch(/from "@\/server\//);
  });

  it("sends the money failure that nothing else can see", () => {
    // Every fee action answers the clerk with one generic string, so `fail()` is
    // the only place a broken payment exists as an event.
    const fees = read(["src", "server", "actions", "fees.ts"]);
    expect(fees).toMatch(/reportError\(error, label\)/);

    // A cron failure has no visitor to fail in front of.
    const cron = read(["src", "app", "api", "cron", "[job]", "route.ts"]);
    expect(cron).toMatch(/reportError\(error, `cron:\$\{job\}`\)/);
  });
});
