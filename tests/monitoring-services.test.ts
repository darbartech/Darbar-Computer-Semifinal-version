import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Task 9a — the two server entry points, tested against what they actually put
 * on the wire.
 *
 * `tests/error-report.test.ts` checks the scrubber and the transport in
 * isolation; this file checks the decisions made in between. They matter
 * because the payloads here come from places a form can reach: `onRequestError`
 * is handed an exception whose message may be a submitted body, and
 * `/api/error-report` is handed a JSON document that anything in a browser may
 * write. Neither is trusted, and both have to arrive at the collector with the
 * personal data already removed.
 *
 * `monitoring.ts` reads its endpoint once, at module load, so the whole file is
 * imported after the environment is set — with `fetch` stood in for, because a
 * test must not make a network call.
 */

const sent = vi.hoisted(() => [] as Record<string, unknown>[]);

function captureFetch(_input: unknown, init?: { body?: unknown }) {
  sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
  return Promise.resolve(new Response(null, { status: 204 }));
}

vi.stubGlobal("fetch", captureFetch);
process.env.ERROR_REPORT_ENDPOINT = "https://collector.example.test/ingest/abc";

const { reportClientError, reportError, reportRequestError } = await import(
  "@/server/services/monitoring"
);

beforeAll(() => {
  expect(sent).toHaveLength(0);
});

function bodyOf(index: number) {
  return sent[index] as Record<string, string | undefined>;
}

describe("reportError / reportRequestError", () => {
  it("sends a scrubbed server report", () => {
    reportError(
      new Error('insert rejected: {"phone":"9841234567","stepUpCode":"904312"}'),
      "createLeadAction"
    );
    const report = bodyOf(0);
    expect(report.surface).toBe("server");
    expect(report.where).toBe("createLeadAction");
    expect(report.message).not.toContain("9841234567");
    expect(report.message).not.toContain("904312");
    expect(report.message).toContain("[number]");
    expect(report.message).toContain('"stepUpCode":"[redacted]"');
  });

  it("labels an uncaught request failure by route type and keeps only the path", () => {
    reportRequestError(
      new Error("boom"),
      { path: "/techdarbar/leads?phone=%2B9779841234567", method: "GET" },
      { routePath: "/techdarbar/leads", routeType: "render" }
    );
    const report = bodyOf(1);
    expect(report.where).toBe("render /techdarbar/leads GET");
    expect(report.route).toBe("/techdarbar/leads");
    expect(JSON.stringify(report)).not.toContain("9841234567");
  });

  it("labels what it knows and invents nothing when Next gives it no route", () => {
    reportRequestError(new Error("boom"), { path: "/x", method: "POST" }, {});
    expect(bodyOf(2).where).toBe("POST");
  });
});

describe("reportClientError", () => {
  it("re-scrubs text that came from a browser", () => {
    reportClientError({
      surface: "client",
      where: "window.onerror",
      name: "TypeError",
      message: "cannot read payments of undefined; owner=principal@school.edu",
      stack: 'TypeError: x\n  at onSubmit ("token":"abc123456789")',
      route: "/student/fees?token=abc123456789",
      occurredAt: "1999-01-01T00:00:00.000Z",
    });
    const report = bodyOf(3);
    expect(report.surface).toBe("client");
    expect(report.message).toBe("cannot read payments of undefined; owner=[email]");
    expect(report.stack).not.toContain("abc123456789");
    expect(report.route).toBe("/student/fees");
    // The browser's clock is not evidence: the server stamps the time it saw.
    expect(report.occurredAt).not.toBe("1999-01-01T00:00:00.000Z");
    expect(new Date(String(report.occurredAt)).getTime()).toBeLessThanOrEqual(
      Date.now() + 1_000
    );
  });

  it("throws away anything that is not the shape it publishes", () => {
    for (const junk of [
      undefined,
      null,
      "a string",
      [],
      [{ message: "sneaked in" }],
      { where: "no message" },
      { message: "   " },
    ]) {
      reportClientError(junk);
    }
    expect(sent).toHaveLength(4);
  });

  it("caps what a browser can send, so one report stays a small POST", () => {
    reportClientError({ message: "y".repeat(9_000), where: "z".repeat(9_000) });
    const report = bodyOf(4);
    expect(report.message).toHaveLength(500);
    expect(report.where).toHaveLength(160);
    expect(report.name).toBe("Error");
  });
});

describe("the contract this module owes its callers", () => {
  it("cannot throw, whatever a caller hands it", () => {
    expect(() => reportError(undefined, "")).not.toThrow();
    expect(() => reportClientError({ message: 42 as unknown as string })).not.toThrow();
  });
});

describe("opt-in", () => {
  it("stays silent when no collector is configured", async () => {
    delete process.env.ERROR_REPORT_ENDPOINT;
    vi.resetModules();
    const before = sent.length;
    const fresh = await import("@/server/services/monitoring");
    expect(fresh.monitoringEnabled()).toBe(false);
    fresh.reportError(new Error("boom"), "nothing to see");
    // The report is handed to `fetch` on a promise, so give it a tick.
    await new Promise((resolve) => setImmediate(resolve));
    expect(sent).toHaveLength(before);
  });
});
