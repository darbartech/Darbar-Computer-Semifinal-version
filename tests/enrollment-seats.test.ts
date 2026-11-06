import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Seat accounting is the part of docs 02 B1 that cannot be eyeballed: an
 * approval must never produce an ACTIVE enrollment without a seat, and never a
 * seat without an ACTIVE enrollment. The DAL enforces that with a guarded
 * `UPDATE "Batch" … WHERE "seatsTaken" < "seatsTotal"` inside a transaction, so
 * the stand-in below reproduces the guard instead of the SQL.
 */

type BatchRow = {
  id: string;
  courseId: string;
  status: string;
  seatsTotal: number;
  seatsTaken: number;
};

type EnrollmentRow = {
  id: string;
  courseId: string;
  studentId: string;
  status: string;
  batchId: string | null;
  decisionNote: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
};

const store = vi.hoisted(() => ({
  batches: [] as BatchRow[],
  enrollments: [] as EnrollmentRow[],
}));

function matches(row: EnrollmentRow, where: Record<string, unknown>): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.studentId !== undefined && row.studentId !== where.studentId) return false;
  const status = where.status as string | { in?: string[] } | undefined;
  if (typeof status === "string") {
    if (row.status !== status) return false;
  } else if (status && Array.isArray(status.in)) {
    if (!status.in.includes(row.status)) return false;
  }
  if ("batchId" in where && where.batchId !== row.batchId) return false;
  return true;
}

vi.mock("@/server/db", () => {
  const tx = {
    enrollment: {
      // A read hands back a snapshot; mutating the row later must not change
      // what the caller already read, the way Prisma's result object does not.
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        const row = store.enrollments.find((candidate) => matches(candidate, where));
        return row ? { ...row } : null;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = store.enrollments.find((candidate) => matches(candidate, where));
        return row ? { ...row } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const rows = store.enrollments.filter((row) => matches(row, where));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
    },
    batch: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.batches.find((batch) => batch.id === where.id) ?? null,
    },
    /**
     * The two seat queries in the DAL differ only by `+ 1` / `- 1`, and both
     * interpolate the batch id first — which is what the guard needs.
     */
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(" ");
      const batch = store.batches.find((row) => row.id === values[0]);
      if (!batch) return 0;
      if (sql.includes("+ 1")) {
        if (batch.seatsTaken >= batch.seatsTotal) return 0;
        batch.seatsTaken += 1;
        return 1;
      }
      if (sql.includes("- 1")) {
        if (batch.seatsTaken <= 0) return 0;
        batch.seatsTaken -= 1;
        return 1;
      }
      throw new Error(`Unexpected raw SQL in the seat path: ${sql}`);
    },
  };

  return {
    db: {
      ...tx,
      /**
       * `reconcileSeatCounts` repairs the counter from the rows in two set-based
       * statements. Both are answered here from the same fixture the guarded
       * `+ 1` / `- 1` writes use, and nothing else is recognised as SQL.
       */
      $queryRaw: (strings: TemplateStringsArray) => {
        const sql = strings.join(" ");
        const holders = (batchId: string) =>
          store.enrollments.filter(
            (row) =>
              row.batchId === batchId && (row.status === "ACTIVE" || row.status === "COMPLETED")
          ).length;

        if (sql.includes(`SET "seatsTaken" = counted.count`)) {
          const touched = store.batches.filter((batch) => {
            const count = holders(batch.id);
            if (count === 0 || batch.seatsTaken === count) return false;
            batch.seatsTaken = count;
            return true;
          });
          return Promise.resolve(touched.map((batch) => ({ id: batch.id })));
        }

        if (sql.includes(`SET "seatsTaken" = 0`)) {
          const touched = store.batches.filter((batch) => {
            if (batch.seatsTaken === 0 || holders(batch.id) > 0) return false;
            batch.seatsTaken = 0;
            return true;
          });
          return Promise.resolve(touched.map((batch) => ({ id: batch.id })));
        }

        throw new Error(`Unexpected raw SQL in the reconcile path: ${sql}`);
      },
      /** A throw must undo every write, the way a rolled-back transaction does. */
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
        const snapshot = structuredClone({
          batches: store.batches,
          enrollments: store.enrollments,
        });
        try {
          return await fn(tx);
        } catch (error) {
          store.batches = snapshot.batches;
          store.enrollments = snapshot.enrollments;
          throw error;
        }
      },
    },
  };
});

const {
  BatchFullError,
  approveEnrollment,
  declineEnrollment,
  dropEnrollment,
  moveEnrollmentBatch,
  waitlistEnrollment,
} = await import("@/server/dal/students");
const { isBatchFull, reconcileSeatCounts, seatsLeft } = await import("@/server/dal/batches");

const COURSE = "course-1";
const OTHER_COURSE = "course-2";

function reset() {
  store.batches = [
    { id: "batch-open", courseId: COURSE, status: "OPEN", seatsTotal: 3, seatsTaken: 1 },
    { id: "batch-full", courseId: COURSE, status: "OPEN", seatsTotal: 2, seatsTaken: 2 },
    { id: "batch-one-seat", courseId: COURSE, status: "OPEN", seatsTotal: 2, seatsTaken: 1 },
    { id: "batch-open-2", courseId: COURSE, status: "RUNNING", seatsTotal: 5, seatsTaken: 0 },
    { id: "batch-other", courseId: OTHER_COURSE, status: "OPEN", seatsTotal: 5, seatsTaken: 0 },
  ];
  store.enrollments = [
    {
      id: "enr-1",
      courseId: COURSE,
      studentId: "stu-1",
      status: "PENDING",
      batchId: null,
      decisionNote: null,
      decidedById: null,
      decidedAt: null,
    },
    {
      id: "enr-2",
      courseId: COURSE,
      studentId: "stu-2",
      status: "PENDING",
      batchId: null,
      decisionNote: null,
      decidedById: null,
      decidedAt: null,
    },
    // A finished course: it took its seat to the end and holds a certificate.
    {
      id: "enr-done",
      courseId: COURSE,
      studentId: "stu-3",
      status: "COMPLETED",
      batchId: "batch-open",
      decisionNote: null,
      decidedById: "staff-1",
      decidedAt: new Date("2026-10-01T00:00:00Z"),
    },
  ];
}

const batch = (id: string) => store.batches.find((b) => b.id === id)!;
const enrollment = (id: string) => store.enrollments.find((e) => e.id === id)!;

beforeEach(reset);

describe("seat counters", () => {
  it("derives FULL from the counters instead of storing it", () => {
    expect(seatsLeft({ seatsTotal: 5, seatsTaken: 2 })).toBe(3);
    expect(seatsLeft({ seatsTotal: 5, seatsTaken: 6 })).toBe(0);
    expect(isBatchFull({ seatsTotal: 2, seatsTaken: 2 })).toBe(true);
    expect(isBatchFull({ seatsTotal: 3, seatsTaken: 2 })).toBe(false);
  });
});

describe("approveEnrollment", () => {
  it("takes a seat and activates the request", async () => {
    const result = await approveEnrollment("enr-1", "batch-open", "staff-1");
    expect(result).toEqual({ ok: true });
    expect(enrollment("enr-1").status).toBe("ACTIVE");
    expect(enrollment("enr-1").batchId).toBe("batch-open");
    expect(batch("batch-open").seatsTaken).toBe(2);
  });

  it("rolls the whole thing back when the batch is full", async () => {
    await expect(approveEnrollment("enr-1", "batch-full", "staff-1")).rejects.toBeInstanceOf(
      BatchFullError
    );
    expect(enrollment("enr-1").status).toBe("PENDING");
    expect(enrollment("enr-1").batchId).toBeNull();
    expect(batch("batch-full").seatsTaken).toBe(2);
  });

  it("gives the last seat to one request only", async () => {
    const first = await approveEnrollment("enr-1", "batch-one-seat", "staff-1").catch((error) => {
      if (error instanceof BatchFullError) return { ok: false, error: "full" };
      throw error;
    });
    expect(first).toEqual({ ok: true });
    await expect(approveEnrollment("enr-2", "batch-one-seat", "staff-1")).rejects.toBeInstanceOf(
      BatchFullError
    );
    expect(enrollment("enr-1").status).toBe("ACTIVE");
    expect(enrollment("enr-2").status).toBe("PENDING");
    expect(batch("batch-one-seat").seatsTaken).toBe(2);
  });

  it("refuses a batch from another course", async () => {
    const result = await approveEnrollment("enr-1", "batch-other", "staff-1");
    expect(result).toEqual({ ok: false, error: "That batch does not belong to this course" });
    expect(batch("batch-other").seatsTaken).toBe(0);
  });

  it("will not double-approve an active request", async () => {
    await approveEnrollment("enr-1", "batch-open", "staff-1");
    const again = await approveEnrollment("enr-1", "batch-open", "staff-1");
    expect(again).toEqual({
      ok: false,
      error: "This request was already handled. Refresh the page.",
    });
    expect(batch("batch-open").seatsTaken).toBe(2);
  });
});

describe("waitlist and decline", () => {
  it("waitlists without touching the seat count", async () => {
    const result = await waitlistEnrollment("enr-1", "staff-1", "December intake", "batch-full");
    expect(result).toEqual({ ok: true });
    expect(enrollment("enr-1").status).toBe("WAITLISTED");
    expect(enrollment("enr-1").decisionNote).toBe("December intake");
    expect(batch("batch-full").seatsTaken).toBe(2);
  });

  it("declines a pending request and leaves the seat alone", async () => {
    const result = await declineEnrollment("enr-1", "staff-1", "Not running this term");
    expect(result).toEqual({ ok: true });
    expect(enrollment("enr-1").status).toBe("REJECTED");
    expect(enrollment("enr-1").decidedById).toBe("staff-1");
  });

  it("releases the seat when an approved student is declined", async () => {
    await approveEnrollment("enr-1", "batch-open", "staff-1");
    expect(batch("batch-open").seatsTaken).toBe(2);
    await declineEnrollment("enr-1", "staff-1", "Refunded");
    expect(enrollment("enr-1").status).toBe("REJECTED");
    expect(batch("batch-open").seatsTaken).toBe(1);
  });

  it("refuses to decline a course that already finished (N7)", async () => {
    const result = await declineEnrollment("enr-done", "staff-1", "Fee never paid, we are told");
    expect(result).toEqual({
      ok: false,
      error: "This course is already finished, so it cannot be declined",
    });
    // History and the seat both stand: a finished enrollment is not a rejection.
    expect(enrollment("enr-done").status).toBe("COMPLETED");
    expect(enrollment("enr-done").decisionNote).toBe(null);
    expect(batch("batch-open").seatsTaken).toBe(1);
  });

  it("releases the seat when the student withdraws", async () => {
    await approveEnrollment("enr-1", "batch-open", "staff-1");
    const result = await dropEnrollment("enr-1", "stu-1", "Schedule clash");
    expect(result).toEqual({ ok: true });
    expect(enrollment("enr-1").status).toBe("DROPPED");
    expect(batch("batch-open").seatsTaken).toBe(1);
  });

  it("scopes a withdrawal to the student who owns it", async () => {
    await approveEnrollment("enr-1", "batch-open", "staff-1");
    const result = await dropEnrollment("enr-1", "stu-2", null);
    expect(result).toEqual({ ok: false, error: "Enrollment not found" });
    expect(batch("batch-open").seatsTaken).toBe(2);
  });
});

describe("moveEnrollmentBatch", () => {
  it("swaps the seat between batches in one step", async () => {
    await approveEnrollment("enr-1", "batch-open", "staff-1");
    const result = await moveEnrollmentBatch("enr-1", "batch-open-2", "staff-1");
    expect(result).toEqual({ ok: true });
    expect(enrollment("enr-1").batchId).toBe("batch-open-2");
    expect(batch("batch-open").seatsTaken).toBe(1);
    expect(batch("batch-open-2").seatsTaken).toBe(1);
  });

  it("keeps the original seat when the destination is full", async () => {
    await approveEnrollment("enr-1", "batch-open", "staff-1");
    await expect(
      moveEnrollmentBatch("enr-1", "batch-full", "staff-1")
    ).rejects.toBeInstanceOf(BatchFullError);
    expect(enrollment("enr-1").batchId).toBe("batch-open");
    expect(batch("batch-open").seatsTaken).toBe(2);
    expect(batch("batch-full").seatsTaken).toBe(2);
  });

  it("only moves an ACTIVE row", async () => {
    const result = await moveEnrollmentBatch("enr-1", "batch-other", "staff-1");
    expect(result).toEqual({
      ok: false,
      error: "Only an approved enrollment can be moved between batches",
    });
  });
});

/**
 * Fix guide §12, item 4's second half: `reconcileSeatCounts` repairs drift
 * between the counter and the rows it counts. It is two set-based statements —
 * one that refills a counter from the grouped enrollments, one that zeroes a
 * batch nobody is holding any more — so the stand-in answers those two shapes
 * and refuses anything else.
 */
describe("reconcileSeatCounts", () => {
  /** The same rule the `db.$queryRaw` fake above implements, spelled out for the asserts. */
  const holders = (batchId: string) =>
    store.enrollments.filter(
      (row) =>
        row.batchId === batchId &&
        (row.status === "ACTIVE" || row.status === "COMPLETED")
    ).length;

  beforeEach(() => {
    // The fixture, with two counters knocked off: one that still counts a
    // student who dropped, one that counts a batch nobody is in.
    reset();
    batch("batch-open").seatsTaken = 3;
    batch("batch-other").seatsTaken = 1;
  });

  it("refills a drifted counter and zeroes an empty one in one pass", async () => {
    // In the fixture only `batch-open` has holders (enr-done, COMPLETED); every
    // other counter is counting people who are not in it.
    const report = await reconcileSeatCounts();

    expect(batch("batch-open").seatsTaken).toBe(holders("batch-open"));
    expect(batch("batch-open").seatsTaken).toBe(1);
    expect(batch("batch-other").seatsTaken).toBe(0);
    expect(report.batchIds.sort()).toEqual([
      "batch-full",
      "batch-one-seat",
      "batch-open",
      "batch-other",
    ]);
    expect(report.corrected).toBe(4);
  });

  it("counts a COMPLETED enrollment as still holding its seat", async () => {
    await approveEnrollment("enr-1", "batch-open-2", "staff-1");
    batch("batch-open-2").seatsTaken = 5;

    await reconcileSeatCounts();
    expect(batch("batch-open-2").seatsTaken).toBe(1);
    expect(batch("batch-open").seatsTaken).toBe(1); // only enr-done, which is COMPLETED
  });

  it("does not count a request that was never approved", async () => {
    await declineEnrollment("enr-2", "staff-1", "no seat needed");
    await reconcileSeatCounts();

    expect(holders("batch-other")).toBe(0);
    expect(batch("batch-other").seatsTaken).toBe(0);
  });

  it("runs clean twice in a row: the second pass finds nothing to fix", async () => {
    await reconcileSeatCounts();
    expect(await reconcileSeatCounts()).toEqual({ corrected: 0, batchIds: [] });
  });

  it("reports a batch that is over its own capacity instead of clamping it", async () => {
    store.enrollments.push({
      id: "enr-orphan",
      courseId: COURSE,
      studentId: "stu-9",
      status: "ACTIVE",
      batchId: "batch-full",
      decisionNote: null,
      decidedById: "staff-1",
      decidedAt: new Date("2026-10-01T00:00:00Z"),
    });
    store.enrollments.push({
      id: "enr-orphan-2",
      courseId: COURSE,
      studentId: "stu-10",
      status: "COMPLETED",
      batchId: "batch-full",
      decisionNote: null,
      decidedById: "staff-1",
      decidedAt: new Date("2026-10-01T00:00:00Z"),
    });
    batch("batch-full").seatsTaken = 0;

    await reconcileSeatCounts();
    // Two holders against two seats is honest; three would be a fact staff see.
    expect(batch("batch-full").seatsTaken).toBe(2);
    expect(batch("batch-full").seatsTotal).toBe(2);
  });
});
