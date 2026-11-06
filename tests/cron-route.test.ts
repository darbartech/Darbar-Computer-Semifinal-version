import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The scheduler's door (doc 07 §2, reaudit N3).
 *
 * Nothing here is user-supplied, so the guard is a shared secret rather than a
 * session — and the guard has to fail closed when the deployment forgets to
 * configure it. The three things the daily job sweeps are stood in for; what is
 * being tested is who gets through and what they are allowed to trigger.
 */

const calls = vi.hoisted(() => ({
  purge: [] as number[][],
  reconcile: 0,
  prune: [] as (number | undefined)[][],
  audit: [] as unknown[],
  reported: [] as [unknown, string][],
  retention: 0,
  failNext: false,
}));

vi.mock("@/server/services/rate-limit", () => ({
  purgeStaleBuckets: async (days?: number) => {
    calls.purge.push([days ?? 0]);
    return 17;
  },
}));
vi.mock("@/server/dal/batches", () => ({
  reconcileSeatCounts: async () => {
    if (calls.failNext) {
      calls.failNext = false;
      throw new Error("database is not reachable");
    }
    calls.reconcile += 1;
    return { corrected: 2, batchIds: ["batch-1", "batch-2"] };
  },
}));
vi.mock("@/server/dal/audit", () => ({
  pruneAuditNoise: async (days?: number) => {
    calls.prune.push([days]);
    return 41;
  },
}));
vi.mock("@/server/dal/retention", () => ({
  runDataRetention: async () => {
    calls.retention += 1;
    return { anonymised: 4, notesCleared: 9, deleted: 2, remaining: false };
  },
}));
vi.mock("@/server/services/audit", () => ({
  audit: async (input: unknown) => {
    calls.audit.push(input);
  },
}));
vi.mock("@/server/services/monitoring", () => ({
  reportError: (error: unknown, where: string) => {
    calls.reported.push([error, where]);
  },
}));

const { POST } = await import("@/app/api/cron/[job]/route");

const SECRET = "test-cron-secret";

function request(authorization?: string): Request {
  return new Request("http://localhost/api/cron/daily", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

function post(job: string, authorization?: string) {
  return POST(request(authorization), { params: Promise.resolve({ job }) });
}

beforeEach(() => {
  calls.purge = [];
  calls.reconcile = 0;
  calls.prune = [];
  calls.audit = [];
  calls.reported = [];
  calls.retention = 0;
  calls.failNext = false;
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("POST /api/cron/[job]", () => {
  it("runs the daily janitor for the right bearer", async () => {
    const response = await post("daily", `Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      job: "daily",
      bucketsDeleted: 17,
      seatsCorrected: 2,
      auditPruned: 41,
    });
    // Two days of history: longer than any window the limiter uses.
    expect(calls.purge).toEqual([[2]]);
    // Retention days come from the DAL, so the janitor and the whitelist cannot
    // drift apart.
    expect(calls.prune).toHaveLength(1);
    expect(calls.prune[0][0]).toBeUndefined();
    expect(calls.reconcile).toBe(1);
    expect(calls.audit).toEqual([
      expect.objectContaining({ action: "cron.run", entity: "System" }),
    ]);
    expect(calls.reported).toHaveLength(0);
  });

  it("answers 401 to everything when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await post("daily", `Bearer ${SECRET}`);
    expect(response.status).toBe(401);
    expect(calls.reconcile).toBe(0);
  });

  it("refuses a missing, malformed or wrong credential", async () => {
    for (const authorization of [
      undefined,
      "",
      SECRET,
      `Basic ${SECRET}`,
      `Bearer ${SECRET}x`,
      "Bearer letmeinletmeinletm",
    ]) {
      const response = await post("daily", authorization);
      expect([authorization, response.status]).toEqual([authorization, 401]);
    }
    expect(calls.reconcile).toBe(0);
  });

  it("runs the retention sweep only when it is asked for by name", async () => {
    const daily = await post("daily", `Bearer ${SECRET}`);
    expect(daily.status).toBe(200);
    // The janitor tidies counters; it does not destroy anybody's data. Folding
    // the sweep into `daily` would put a weekly deletion behind a line an
    // operator runs by hand while debugging something else.
    expect(calls.retention).toBe(0);

    const response = await post("retention", `Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      job: "retention",
      leadsAnonymised: 4,
      leadNotesCleared: 9,
      messagesDeleted: 2,
      remaining: false,
    });
    expect(calls.retention).toBe(1);

    // Counts, and nothing that names who was purged: that is the data the job
    // exists to forget, and it must not re-enter through the audit trail.
    expect(calls.audit[calls.audit.length - 1]).toEqual(
      expect.objectContaining({
        action: "cron.run",
        entity: "System",
        meta: {
          leadsAnonymised: 4,
          leadNotesCleared: 9,
          messagesDeleted: 2,
          remaining: false,
        },
      })
    );
  });

  it("404s an unregistered job instead of running a name it does not know", async () => {
    const response = await post("wipe-everything", `Bearer ${SECRET}`);
    expect(response.status).toBe(404);
    expect(calls.reconcile).toBe(0);
  });

  it("500s when a job throws, and leaves no half-written success behind", async () => {
    calls.failNext = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await post("daily", `Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    expect(calls.audit).toHaveLength(0);
    // The scheduler runs where nobody is watching, so the failure has to leave
    // the process: 500 to the caller's curl and a report to the collector.
    expect(calls.reported).toHaveLength(1);
    expect(calls.reported[0][1]).toBe("cron:daily");
    expect(calls.reported[0][0]).toBeInstanceOf(Error);
    errorSpy.mockRestore();
  });
});
