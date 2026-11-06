import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Task 9b — the retention sweep.
 *
 * This is the only scheduled job in the build that destroys personal data, so
 * the tests are written as the limits of what it may do rather than as a
 * description of two queries:
 *
 *  - it must not reach past its window into live enquiries,
 *  - it must not touch a lead that became a student,
 *  - it must not delete the row it anonymised (the point of `deletedAt` is that
 *    the purge can be undone),
 *  - it must not be able to be talked into emptying the table by a `0`,
 *  - and it must bound one run, because the first sweep after years of nothing
 *    would otherwise hold a write lock over the fees desk.
 *
 * Modelled on `tests/audit-retention.test.ts`: the database is a recorder, and
 * what is asserted is the `where` and `data` it was handed.
 */

type Recorded = Record<string, unknown>;
type Write = { where: Recorded; data: Recorded };
type Delete = { where: Recorded };

const queries = vi.hoisted(() => ({
  leadFind: [] as Recorded[],
  leadUpdate: [] as Write[],
  activityUpdate: [] as Write[],
  messageFind: [] as Recorded[],
  messageDelete: [] as Delete[],
  leadCounts: [] as number[],
  activityCounts: [] as number[],
  messageCounts: [] as number[],
}));

/** Ids the `findMany` stubs hand back, one per call, so a test can set the size. */
const pages = vi.hoisted(() => ({
  leads: 2 as number,
  messages: 1 as number,
  retention: { leadMonths: 24, messageMonths: 12 },
}));

const ids = (count: number) => Array.from({ length: count }, (_, i) => `id-${i}`);

vi.mock("@/server/db", () => ({
  db: {
    lead: {
      findMany: async (args: Record<string, unknown>) => {
        queries.leadFind.push(args);
        return ids(pages.leads).map((id) => ({ id }));
      },
      updateMany: async (args: Write) => {
        queries.leadUpdate.push(args);
        // The fake database answers with the rows it was actually given, which
        // is what makes the cap on a run observable.
        const count = (args.where.id as { in: unknown[] }).in.length;
        queries.leadCounts.push(count);
        return { count };
      },
    },
    leadActivity: {
      updateMany: async (args: Write) => {
        queries.activityUpdate.push(args);
        queries.activityCounts.push(5);
        return { count: 5 };
      },
    },
    contactMessage: {
      findMany: async (args: Recorded) => {
        queries.messageFind.push(args);
        return ids(pages.messages).map((id) => ({ id }));
      },
      deleteMany: async (args: Delete) => {
        queries.messageDelete.push(args);
        const count = (args.where.id as { in: unknown[] }).in.length;
        queries.messageCounts.push(count);
        return { count };
      },
    },
    // The DAL passes an array of operations and reads their results back in
    // order, which is what `Promise.all` already does.
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}));

vi.mock("@/server/dal/settings", () => ({
  getSiteSettings: async () => ({ retention: pages.retention }),
}));

const {
  ANONYMISED_FULL_NAME,
  RETENTION_ROWS_PER_RUN,
  anonymiseExpiredLeads,
  deleteExpiredMessages,
  runDataRetention,
} = await import("@/server/dal/retention");

const NOW = new Date("2026-11-06T04:00:00.000Z");

function leadFind(): Record<string, unknown> {
  return queries.leadFind[queries.leadFind.length - 1]!;
}

function messageFind(): Record<string, unknown> {
  return queries.messageFind[queries.messageFind.length - 1]!;
}

/** Months from `NOW` to the cutoff the query used, rounded to the nearest month. */
function monthsBack(cutoff: Date): number {
  return Math.round((NOW.getTime() - cutoff.getTime()) / (30.44 * 86_400_000));
}

beforeEach(() => {
  for (const key of Object.keys(queries)) {
    (queries as unknown as Record<string, unknown[]>)[key] = [];
  }
  pages.leads = 2;
  pages.messages = 1;
  pages.retention = { leadMonths: 24, messageMonths: 12 };
});

describe("anonymiseExpiredLeads", () => {
  it("selects on last touch, skipping purged and converted rows", async () => {
    await anonymiseExpiredLeads(24, NOW);
    expect(leadFind().where).toEqual({
      deletedAt: null,
      studentId: null,
      updatedAt: { lt: expect.any(Date) },
    });
    expect(monthsBack((leadFind().where as { updatedAt: { lt: Date } }).updatedAt.lt)).toBe(24);
    // Oldest first: a bounded run should finish the stalest data before anything.
    expect(leadFind().orderBy).toEqual({ updatedAt: "asc" });
  });

  it("clears every field a stranger wrote and keeps the ones the counts need", async () => {
    await anonymiseExpiredLeads(24, NOW);
    expect(queries.leadUpdate).toHaveLength(1);
    const data = queries.leadUpdate[0]!.data;

    expect(data.fullName).toBe(ANONYMISED_FULL_NAME);
    expect(data.phone).toBe("");
    expect(data.phoneNormalized).toBeNull();
    expect(data.email).toBeNull();
    expect(data.message).toBeNull();
    expect(data.ipHash).toBeNull();

    // Not a delete, and nothing that a report still groups by.
    expect(data.status).toBeUndefined();
    expect(data.courseTitle).toBeUndefined();
    expect(data.createdAt).toBeUndefined();
    expect((data.deletedAt as Date).getTime()).toBe(NOW.getTime());
  });

  it("clears the note text of the same leads, and only where there is text", async () => {
    await anonymiseExpiredLeads(24, NOW);
    expect(queries.activityUpdate).toHaveLength(1);
    expect(queries.activityUpdate[0]!.where).toEqual({
      leadId: { in: ids(2) },
      body: { not: null },
    });
    expect(queries.activityUpdate[0]!.data).toEqual({ body: null });
  });

  it("reports the counts it changed, not the rows it changed", async () => {
    await expect(anonymiseExpiredLeads(24, NOW)).resolves.toEqual({
      anonymised: 2,
      notesCleared: 5,
      remaining: false,
    });
  });

  it("writes nothing when nothing has expired", async () => {
    pages.leads = 0;
    await expect(anonymiseExpiredLeads(24, NOW)).resolves.toEqual({
      anonymised: 0,
      notesCleared: 0,
      remaining: false,
    });
    expect(queries.leadUpdate).toHaveLength(0);
    expect(queries.activityUpdate).toHaveLength(0);
  });

  it("bounds one run and says there is more to do", async () => {
    pages.leads = RETENTION_ROWS_PER_RUN + 1;
    const result = await anonymiseExpiredLeads(24, NOW);
    expect(result.remaining).toBe(true);
    expect(result.anonymised).toBe(RETENTION_ROWS_PER_RUN);
    expect(queries.leadFind[0]!.take).toBe(RETENTION_ROWS_PER_RUN + 1);
    // The extra page of ids is dropped, so the write stays inside the cap.
    expect((queries.leadUpdate[0]!.where.id as { in: string[] }).in).toHaveLength(
      RETENTION_ROWS_PER_RUN
    );
  });

  for (const months of [0, -12, 1.5, Number.NaN]) {
    it(`refuses a window of ${months} instead of emptying the table`, async () => {
      await expect(anonymiseExpiredLeads(months, NOW)).rejects.toBeInstanceOf(RangeError);
      expect(queries.leadFind).toHaveLength(0);
      expect(queries.leadUpdate).toHaveLength(0);
    });
  }
});

describe("deleteExpiredMessages", () => {
  it("reads the aged ids and deletes exactly those", async () => {
    const result = await deleteExpiredMessages(12, NOW);
    expect(messageFind().where).toEqual({ createdAt: { lt: expect.any(Date) } });
    expect(monthsBack((messageFind().where as { createdAt: { lt: Date } }).createdAt.lt)).toBe(
      12
    );
    expect(result).toEqual({ deleted: 1, remaining: false });
    expect(queries.messageDelete[0]!.where).toEqual({ id: { in: ["id-0"] } });
  });

  it("deletes nothing when nothing has expired", async () => {
    pages.messages = 0;
    await expect(deleteExpiredMessages(12, NOW)).resolves.toEqual({
      deleted: 0,
      remaining: false,
    });
    expect(queries.messageDelete).toHaveLength(0);
  });

  it("refuses the same nonsense windows", async () => {
    await expect(deleteExpiredMessages(0, NOW)).rejects.toBeInstanceOf(RangeError);
    await expect(deleteExpiredMessages(2.5, NOW)).rejects.toBeInstanceOf(RangeError);
    expect(queries.messageFind).toHaveLength(0);
  });
});

describe("runDataRetention", () => {
  it("takes both windows from Settings", async () => {
    pages.retention = { leadMonths: 18, messageMonths: 6 };
    await runDataRetention(NOW);
    expect(monthsBack((leadFind().where as { updatedAt: { lt: Date } }).updatedAt.lt)).toBe(18);
    expect(
      monthsBack((messageFind().where as { createdAt: { lt: Date } }).createdAt.lt)
    ).toBe(6);
  });

  it("answers with counts and one flag, which is what the audit row may hold", async () => {
    pages.leads = 3;
    pages.messages = 2;
    await expect(runDataRetention(NOW)).resolves.toEqual({
      anonymised: 3,
      notesCleared: 5,
      deleted: 2,
      remaining: false,
    });
  });

  it("carries on next run when either half hit its cap", async () => {
    pages.leads = RETENTION_ROWS_PER_RUN + 1;
    pages.messages = 1;
    await expect(runDataRetention(NOW)).resolves.toMatchObject({ remaining: true });

    pages.leads = 1;
    pages.messages = RETENTION_ROWS_PER_RUN + 1;
    await expect(runDataRetention(NOW)).resolves.toMatchObject({ remaining: true });
  });

  it("never puts a name in the sweep's own return value", async () => {
    const result = await runDataRetention(NOW);
    expect(JSON.stringify(result)).not.toContain("id-0");
  });
});

/* ─────────────── the reads that must stop showing purged leads ─────────────── */

describe("leadScopeWhere", () => {
  it("hides an anonymised lead from every read that shares the predicate", async () => {
    const { leadScopeWhere } = await import("@/server/dal/leads");

    expect(leadScopeWhere({ userId: "u-1", role: "ADMIN" })).toEqual({ deletedAt: null });
    expect(leadScopeWhere({ userId: "u-1", role: "COUNSELOR" })).toEqual({
      AND: [
        { deletedAt: null },
        { OR: [{ assignedToId: "u-1" }, { assignedToId: null }] },
      ],
    });
  });
});
