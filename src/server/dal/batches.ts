import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import type { BatchStatus } from "../../generated/prisma/enums";
import { db } from "../db";
import { cached } from "../cache";
import { ADMIN_PICKER_LIMIT } from "../constants";
import { BATCH_TAGS } from "../revalidate";
import { batchScopeWhere, type StaffScope } from "./scope";

export const PAGE_SIZE = 20;

/**
 * Batches a staff member may put a new student into (docs 02 B1). A cancelled
 * or finished batch is closed even if it still shows free seats.
 */
export const JOINABLE_BATCH_STATUSES: BatchStatus[] = ["UPCOMING", "OPEN", "RUNNING"];

/**
 * `BatchStatus.FULL` is derived from the seat counters and never stored: the
 * enum value stays for old rows, but nothing writes it (docs 02 B1).
 */
export function seatsLeft(batch: { seatsTotal: number; seatsTaken: number }): number {
  return Math.max(0, batch.seatsTotal - batch.seatsTaken);
}

export function isBatchFull(batch: { seatsTotal: number; seatsTaken: number }): boolean {
  return batch.seatsTaken >= batch.seatsTotal;
}

export type BatchSeatOption = {
  id: string;
  courseId: string;
  name: string;
  startDate: string;
  timeSlot: string;
  seatsTotal: number;
  seatsTaken: number;
  seatsLeft: number;
};

/**
 * Joinable batches with their remaining seats, for the enrollment review picker
 * and the public "Seats left" line. One query for many courses so a review page
 * with a dozen requests stays a single round trip.
 */
export async function listSeatOptionsForCourses(
  courseIds: string[]
): Promise<BatchSeatOption[]> {
  if (courseIds.length === 0) return [];
  const rows = await db.batch.findMany({
    where: { courseId: { in: courseIds }, status: { in: JOINABLE_BATCH_STATUSES } },
    orderBy: [{ courseId: "asc" }, { startDate: "asc" }],
    select: {
      id: true,
      courseId: true,
      name: true,
      startDate: true,
      timeSlot: true,
      seatsTotal: true,
      seatsTaken: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    courseId: row.courseId,
    name: row.name,
    startDate: row.startDate.toISOString().slice(0, 10),
    timeSlot: row.timeSlot,
    seatsTotal: row.seatsTotal,
    seatsTaken: row.seatsTaken,
    seatsLeft: seatsLeft(row),
  }));
}

/**
 * Public "Seats left" line (docs 02 B1). Cached under the batch and course tags
 * so an enrollment transition, not a rebuild, is what changes the number.
 */
export type CourseSeatsSummary = {
  nextBatch: { name: string; startDate: string; timeSlot: string; seatsLeft: number } | null;
  seatsLeftTotal: number;
  openBatchCount: number;
};

export const getSeatsSummaryForCourse = cached(
  BATCH_TAGS,
  async (courseId: string): Promise<CourseSeatsSummary> => {
    const options = await listSeatOptionsForCourses([courseId]);
    const first = options[0] ?? null;
    return {
      nextBatch: first
        ? {
            name: first.name,
            startDate: first.startDate,
            timeSlot: first.timeSlot,
            seatsLeft: first.seatsLeft,
          }
        : null,
      seatsLeftTotal: options.reduce((sum, batch) => sum + batch.seatsLeft, 0),
      openBatchCount: options.length,
    };
  }
);

/**
 * Every course, for the batch form's dropdown. Drafts are included: a batch is
 * usually opened before the course page is published.
 */
export async function listCoursesForBatchForm(): Promise<
  { id: string; title: string; status: string }[]
> {
  return db.course.findMany({
    orderBy: { title: "asc" },
    take: ADMIN_PICKER_LIMIT,
    select: { id: true, title: true, status: true },
  });
}

/**
 * Who may be set as a batch's teacher of record (fix guide §5). Only active
 * INSTRUCTOR accounts: the field is what scopes that role's reads, so offering a
 * reception or a student would quietly hand the roster to the wrong person.
 */
export async function listBatchInstructors(): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: { role: "INSTRUCTOR", isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: ADMIN_PICKER_LIMIT,
  });
}

/** Server-side check behind the dropdown — never trust the option list. */
export async function isActiveInstructor(id: string): Promise<boolean> {
  const user = await db.user.findFirst({
    where: { id, role: "INSTRUCTOR", isActive: true },
    select: { id: true },
  });
  return Boolean(user);
}

export type AdminBatchView = {
  id: string;
  name: string;
  courseId: string;
  courseTitle: string;
  /** `YYYY-MM-DD`, what the date input and the table both show. */
  startDate: string;
  timeSlot: string;
  seatsTotal: number;
  seatsTaken: number;
  seatsLeft: number;
  status: string;
  instructorId: string | null;
  instructorName: string | null;
};

/**
 * The batch list (fix guide §5). It had no caller before — the admin area never
 * had a batches screen, which is why the instructor selector had nowhere to
 * live — so this is also the first read that shapes `Batch` for a page.
 *
 * An INSTRUCTOR sees their own batches only; `batch.write` is not in their
 * permission set, so the list is the read side of the same rule.
 */
export async function adminListBatches(
  filters: { q?: string; courseId?: string; status?: string; page?: number },
  scope: StaffScope
): Promise<{ rows: AdminBatchView[]; total: number; page: number; pageCount: number }> {
  const conditions: Prisma.BatchWhereInput[] = [batchScopeWhere(scope)];
  if (filters.q) conditions.push({ name: { contains: filters.q, mode: "insensitive" } });
  if (filters.courseId) conditions.push({ courseId: filters.courseId });
  if (filters.status) conditions.push({ status: filters.status as Prisma.EnumBatchStatusFilter });
  const where = { AND: conditions };
  const total = await db.batch.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.batch.findMany({
    where,
    include: {
      course: { select: { id: true, title: true } },
      instructor: { select: { id: true, name: true } },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      courseId: row.courseId,
      courseTitle: row.course.title,
      startDate: row.startDate.toISOString().slice(0, 10),
      timeSlot: row.timeSlot,
      seatsTotal: row.seatsTotal,
      seatsTaken: row.seatsTaken,
      seatsLeft: seatsLeft(row),
      status: row.status,
      instructorId: row.instructor?.id ?? null,
      instructorName: row.instructor?.name ?? null,
    })),
    total,
    page,
    pageCount,
  };
}

export const adminGetBatch = async (id: string) => db.batch.findUnique({ where: { id }, include: { course: true } });export const createBatch = async (data: Prisma.BatchCreateInput) => db.batch.create({ data });
export const updateBatch = async (id: string, data: Prisma.BatchUpdateInput) => db.batch.update({ where: { id }, data });

export type BatchDeleteResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" | "IN_USE" };

/**
 * Refuse to delete a batch that still holds seats or enrollment rows (docs 02
 * B1): dropping it would strand students and leave `seatsTaken` counted against
 * nothing. Cancelling is the intended way to retire a batch.
 */
export async function deleteBatch(id: string): Promise<BatchDeleteResult> {
  return db.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id },
      select: {
        id: true,
        seatsTaken: true,
        _count: { select: { enrollments: true } },
      },
    });
    if (!batch) return { ok: false, error: "NOT_FOUND" };
    if (batch.seatsTaken > 0 || batch._count.enrollments > 0) {
      return { ok: false, error: "IN_USE" };
    }
    await tx.batch.delete({ where: { id } });
    return { ok: true };
  });
}

/**
 * Nightly seat repair (doc 07 §2, reaudit N3).
 *
 * `seatsTaken` is a counter maintained inside the transaction that moves a
 * student in or out, so it can drift if a write path is added and forgets to
 * claim or release. This recomputes it from the rows that actually hold a seat —
 * ACTIVE and COMPLETED, because a finished course keeps the place it took (see
 * `completeEnrollment`) — and reports which batches were wrong.
 *
 * It deliberately does not clamp to `seatsTotal`: a batch whose true holder count
 * exceeds its capacity is a fact staff have to see, not an error to hide.
 */
export type SeatReconcileReport = { corrected: number; batchIds: string[] };

export async function reconcileSeatCounts(): Promise<SeatReconcileReport> {
  const refilled = await db.$queryRaw<{ id: string }[]>`
    UPDATE "Batch" b
    SET "seatsTaken" = counted.count, "updatedAt" = now()
    FROM (
      SELECT e."batchId" AS batch_id, COUNT(*)::int AS count
      FROM "Enrollment" e
      WHERE e.status IN ('ACTIVE', 'COMPLETED') AND e."batchId" IS NOT NULL
      GROUP BY e."batchId"
    ) counted
    WHERE b.id = counted.batch_id
      AND b."seatsTaken" <> counted.count
    RETURNING b.id`;

  const emptied = await db.$queryRaw<{ id: string }[]>`
    UPDATE "Batch" b
    SET "seatsTaken" = 0, "updatedAt" = now()
    WHERE b."seatsTaken" <> 0
      AND NOT EXISTS (
        SELECT 1
        FROM "Enrollment" e
        WHERE e."batchId" = b.id AND e.status IN ('ACTIVE', 'COMPLETED')
      )
    RETURNING b.id`;

  const batchIds = [...refilled, ...emptied].map((row) => row.id);
  return { corrected: batchIds.length, batchIds };
}
