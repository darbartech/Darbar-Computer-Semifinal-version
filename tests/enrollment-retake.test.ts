import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix guide §9 — a finished enrollment must not be a life sentence.
 *
 * The old code had one row per (student, course) and re-asked by overwriting it,
 * so a retake erased the drop date, the decision note and the decider, and a
 * COMPLETED course could never be re-taken at all. These tests pin the new rule:
 * history rows are read, never rewritten; a new request is a new row; and the only
 * thing still forbidden is two live rows for one course.
 *
 * The database enforces the live-row rule with the partial unique index
 * `Enrollment_live_student_course_key` (migration 20261105140000), so the DAL is
 * tested against a stand-in that throws the same P2002 Postgres would.
 */

type Row = { status: string; decidedAt: Date | null; createdAt: Date };

const state = vi.hoisted(() => ({
  rows: [] as { status: string; decidedAt: Date | null; createdAt: Date }[],
  created: [] as Record<string, unknown>[],
  updated: 0,
  raceOnCreate: false,
  /** The row the other tab managed to insert before us. */
  winner: "ACTIVE",
}));

vi.mock("@/server/db", () => ({
  db: {
    course: { findFirst: async () => ({ id: "course-1" }) },
    enrollment: {
      findMany: async () => state.rows,
      findFirst: async () =>
        state.rows.find((r) => ["PENDING", "ACTIVE", "WAITLISTED"].includes(r.status)) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        if (state.raceOnCreate) {
          // Postgres refused us: the other insert is now the live row.
          state.rows.push({ status: state.winner, decidedAt: null, createdAt: new Date() });
          const error = new Error("Unique constraint failed on the fields: (`studentId`,`courseId`)");
          (error as Error & { code: string }).code = "P2002";
          throw error;
        }
        state.created.push(args.data);
      },
      update: async () => {
        state.updated += 1;
      },
    },
  },
}));

const { requestCourseEnrollment } = await import("../src/server/dal/students");

const DAY = 86_400_000;
function row(status: string, over: Partial<Row> = {}): Row {
  return { status, decidedAt: null, createdAt: new Date(Date.now() - DAY), ...over };
}

beforeEach(() => {
  state.rows = [];
  state.created = [];
  state.updated = 0;
  state.raceOnCreate = false;
  state.winner = "ACTIVE";
});

describe("requestCourseEnrollment", () => {
  it("adds a new row instead of rewriting a dropped one", async () => {
    state.rows = [row("DROPPED", { decidedAt: new Date(Date.now() - 5 * DAY) })];
    expect(await requestCourseEnrollment("s-1", "course-1")).toEqual({ kind: "created" });
    expect(state.created).toEqual([{ studentId: "s-1", courseId: "course-1", status: "PENDING" }]);
    // The whole point: no UPDATE, so the withdrawal keeps its date and note.
    expect(state.updated).toBe(0);
  });

  it("lets a completed course be re-taken", async () => {
    state.rows = [row("COMPLETED")];
    expect(await requestCourseEnrollment("s-1", "course-1")).toEqual({ kind: "created" });
    expect(state.created).toHaveLength(1);
  });

  it("refuses while a live row holds the place", async () => {
    for (const status of ["PENDING", "ACTIVE", "WAITLISTED"]) {
      state.rows = [row(status)];
      expect(await requestCourseEnrollment("s-1", "course-1")).toEqual({ kind: "existing", status });
    }
    expect(state.created).toHaveLength(0);
  });

  it("keeps the 30-day cooldown on a fresh rejection", async () => {
    const decidedAt = new Date(Date.now() - 4 * DAY);
    state.rows = [row("REJECTED", { decidedAt })];
    const result = await requestCourseEnrollment("s-1", "course-1");
    expect(result?.kind).toBe("blocked");
    expect((result as { retryAfter: Date }).retryAfter.getTime()).toBe(decidedAt.getTime() + 30 * DAY);
    expect(state.created).toHaveLength(0);
  });

  it("re-asks after the cooldown, next to the rejection it does not erase", async () => {
    state.rows = [row("REJECTED", { decidedAt: new Date(Date.now() - 40 * DAY) })];
    expect(await requestCourseEnrollment("s-1", "course-1")).toEqual({ kind: "created" });
    expect(state.created).toHaveLength(1);
    expect(state.updated).toBe(0);
  });

  it("judges the cooldown by the newest rejection, not an older one", async () => {
    state.rows = [
      row("REJECTED", { decidedAt: new Date(Date.now() - 2 * DAY), createdAt: new Date(Date.now() - 2 * DAY) }),
      row("DROPPED", { decidedAt: new Date(Date.now() - 200 * DAY), createdAt: new Date(Date.now() - 200 * DAY) }),
    ];
    expect((await requestCourseEnrollment("s-1", "course-1"))?.kind).toBe("blocked");
  });

  it("reports the winner's row when a second tab inserts first", async () => {
    // The read saw only history, so the insert went ahead — and the index refused
    // it. The answer must come from the row that won, never from a guess and never
    // by writing a second live row.
    state.rows = [row("DROPPED")];
    state.raceOnCreate = true;
    state.winner = "ACTIVE";
    expect(await requestCourseEnrollment("s-1", "course-1")).toEqual({
      kind: "existing",
      status: "ACTIVE",
    });

    state.rows = [row("DROPPED")];
    state.raceOnCreate = true;
    state.winner = "PENDING";
    expect(await requestCourseEnrollment("s-1", "course-1")).toEqual({
      kind: "existing",
      status: "PENDING",
    });
    expect(state.created).toHaveLength(0);
  });
});
