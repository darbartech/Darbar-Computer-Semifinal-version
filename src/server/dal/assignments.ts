import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { ADMIN_PICKER_LIMIT } from "../constants";
import {
  assignmentScopeWhere,
  enrollmentScopeWhere,
  recipientScopeWhere,
  submissionScopeWhere,
  type StaffScope,
} from "./scope";

/**
 * Assignments data access (docs/02 §4: pages call DAL functions, never `db.*`).
 *
 * An assignment belongs to a Course, which only groups it and limits who can be
 * picked. The students who actually owe it are the `AssignmentRecipient` rows the
 * instructor ticked, so one course can carry different tasks per student. Portal
 * reads therefore start from the caller's own recipient rows, and a student can
 * only ever see and answer their own task.
 *
 * Every staff read also takes the caller's `StaffScope` (fix guide §5): an
 * INSTRUCTOR sees the tasks of their own batches, not the institute's.
 */

export const PAGE_SIZE = 20;

/** Students the picker offers: everyone enrolled except those who dropped out. */
const ATTENDED_ENROLLMENT: Prisma.EnrollmentWhereInput = { status: { not: "DROPPED" } };

const DAY_MS = 24 * 60 * 60 * 1000;

export type AssignmentWriteData = {
  courseId: string;
  title: string;
  instructions: string | null;
  dueDate: Date | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  studentIds: string[];
};

const dedupe = (ids: string[]) => [...new Set(ids)];

const assignmentListSelect = {
  id: true,
  title: true,
  instructions: true,
  status: true,
  dueDate: true,
  createdAt: true,
  course: { select: { id: true, title: true, slug: true } },
  recipients: { select: { studentId: true }, take: ADMIN_PICKER_LIMIT },
  _count: { select: { submissions: true, recipients: true } },
} satisfies Prisma.AssignmentSelect;

type AssignmentListRow = Prisma.AssignmentGetPayload<{ select: typeof assignmentListSelect }>;

export type AdminAssignmentView = {
  id: string;
  title: string;
  instructions: string | null;
  status: string;
  dueDate: string | null;
  createdAt: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  studentIds: string[];
  recipientCount: number;
  submissionCount: number;
};

function toAdminAssignment(row: AssignmentListRow): AdminAssignmentView {
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    status: row.status,
    dueDate: row.dueDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    courseId: row.course.id,
    courseTitle: row.course.title,
    courseSlug: row.course.slug,
    studentIds: row.recipients.map((recipient) => recipient.studentId),
    // The denominator comes from the count, not the capped list above it, so the
    // "3/25 submitted" column stays honest on a roster the ceiling would trim.
    recipientCount: row._count.recipients,
    submissionCount: row._count.submissions,
  };
}

export const adminListAssignments = async (
  filters: {
    q?: string;
    courseId?: string;
    status?: string;
    page?: number;
  },
  scope: StaffScope
) => {
  const conditions: Prisma.AssignmentWhereInput[] = [assignmentScopeWhere(scope)];
  if (filters.q) conditions.push({ title: { contains: filters.q, mode: "insensitive" } });
  if (filters.courseId) conditions.push({ courseId: filters.courseId });
  if (filters.status) conditions.push({ status: filters.status as Prisma.EnumPublishStatusFilter });
  const where = { AND: conditions };

  const total = await db.assignment.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.assignment.findMany({
    where,
    select: assignmentListSelect,
    // Soonest deadline first; undated tasks fall back to newest.
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return { rows: rows.map(toAdminAssignment), total, page, pageCount };
};

/**
 * Existence check for the write actions; the detail page uses the view below.
 * `findFirst` with the scope folded into the where clause, so an id outside the
 * caller's batches matches nothing and reads as "not found" (fix guide §5).
 */
export const adminGetAssignment = async (id: string, scope: StaffScope) =>
  db.assignment.findFirst({ where: { AND: [{ id }, assignmentScopeWhere(scope)] }, select: { id: true } });

/**
 * Write-side check. Reading is "my batches", writing is "my own task": a
 * teacher who inherits a class reviews its links, but does not rewrite or
 * delete the task another instructor set.
 */
export const adminGetWritableAssignment = async (id: string, scope: StaffScope) =>
  db.assignment.findFirst({
    where: {
      AND: [
        { id },
        scope.role === "INSTRUCTOR"
          ? { createdById: scope.userId }
          : assignmentScopeWhere(scope),
      ],
    },
    select: { id: true },
  });

export type AdminAssignmentStudentRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  approvalStatus: string;
  seenAt: string | null;
  submission: {
    id: string;
    url: string;
    reviewStatus: string;
    reviewNote: string | null;
    reviewedByName: string | null;
    reviewedAt: string | null;
    updatedAt: string;
  } | null;
};

export type AdminAssignmentDetail = {
  id: string;
  title: string;
  instructions: string | null;
  status: string;
  dueDate: string | null;
  courseTitle: string;
  courseSlug: string;
  createdByName: string | null;
  rows: AdminAssignmentStudentRow[];
};

/**
 * One row per assigned student — including the ones who have not submitted yet,
 * so an instructor can see who is outstanding rather than only who responded.
 * Submissions are matched in JS because `AssignmentSubmission` relates to the
 * assignment and the student, not to the recipient row.
 */
export async function adminGetAssignmentDetail(
  id: string,
  scope: StaffScope
): Promise<AdminAssignmentDetail | null> {
  const assignment = await db.assignment.findFirst({
    where: { AND: [{ id }, assignmentScopeWhere(scope)] },
    select: {
      id: true,
      title: true,
      instructions: true,
      status: true,
      dueDate: true,
      course: { select: { title: true, slug: true } },
      createdBy: { select: { name: true } },
      recipients: {
        where: recipientScopeWhere(scope),
        orderBy: { student: { studentCode: "asc" } },
        take: ADMIN_PICKER_LIMIT,
        select: {
          studentId: true,
          seenAt: true,
          student: {
            select: {
              studentCode: true,
              approvalStatus: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!assignment) return null;

  // The roster and its submissions are paired by student, so both carry the same
  // ceiling; a taller roster than this has never been posted to one task.
  const submissions = await db.assignmentSubmission.findMany({
    where: { assignmentId: id },
    take: ADMIN_PICKER_LIMIT,
    select: {
      id: true,
      studentId: true,
      url: true,
      reviewStatus: true,
      reviewNote: true,
      reviewedAt: true,
      updatedAt: true,
      reviewedBy: { select: { name: true } },
    },
  });
  const byStudent = new Map(submissions.map((row) => [row.studentId, row]));

  return {
    id: assignment.id,
    title: assignment.title,
    instructions: assignment.instructions,
    status: assignment.status,
    dueDate: assignment.dueDate?.toISOString() ?? null,
    courseTitle: assignment.course.title,
    courseSlug: assignment.course.slug,
    createdByName: assignment.createdBy?.name ?? null,
    rows: assignment.recipients.map((recipient) => {
      const submission = byStudent.get(recipient.studentId);
      return {
        studentId: recipient.studentId,
        studentCode: recipient.student.studentCode,
        studentName: recipient.student.user.name,
        approvalStatus: recipient.student.approvalStatus,
        seenAt: recipient.seenAt?.toISOString() ?? null,
        submission: submission
          ? {
              id: submission.id,
              url: submission.url,
              reviewStatus: submission.reviewStatus,
              reviewNote: submission.reviewNote,
              reviewedByName: submission.reviewedBy?.name ?? null,
              reviewedAt: submission.reviewedAt?.toISOString() ?? null,
              updatedAt: submission.updatedAt.toISOString(),
            }
          : null,
      };
    }),
  };
}

export const createAssignment = async (data: AssignmentWriteData & { createdById: string }) =>
  db.assignment.create({
    data: {
      title: data.title,
      instructions: data.instructions,
      dueDate: data.dueDate,
      status: data.status,
      course: { connect: { id: data.courseId } },
      createdBy: { connect: { id: data.createdById } },
      recipients: { createMany: { data: dedupe(data.studentIds).map((studentId) => ({ studentId })) } },
    },
    select: { id: true },
  });

/**
 * The ticked list is authoritative: recipients are replaced in one transaction,
 * delete first so a re-picked student cannot collide with the unique index.
 * Submissions are never touched here — a link already handed in survives an edit
 * that keeps the student, and an unticked student's link simply stops being shown.
 */
export const updateAssignment = async (id: string, data: AssignmentWriteData) => {
  const [result] = await db.$transaction([
    db.assignmentRecipient.deleteMany({ where: { assignmentId: id } }),
    db.assignment.update({
      where: { id },
      data: {
        title: data.title,
        instructions: data.instructions,
        dueDate: data.dueDate,
        status: data.status,
        course: { connect: { id: data.courseId } },
        recipients: { createMany: { data: dedupe(data.studentIds).map((studentId) => ({ studentId })) } },
      },
      select: { id: true },
    }),
  ]);
  return result;
};

/**
 * Returns how many rows went away. `deleteMany` with the scope in the where
 * clause is what stops an instructor from deleting a task they can see but did
 * not write.
 */
export const deleteAssignment = async (id: string, scope: StaffScope): Promise<number> => {
  const result = await db.assignment.deleteMany({
    where:
      scope.role === "INSTRUCTOR" ? { id, createdById: scope.userId } : { id },
  });
  return result.count;
};

/** Students the picker offers for one course, with who is already assigned. */
export const listCourseStudents = async (courseId: string, scope: StaffScope) => {
  const rows = await db.enrollment.findMany({
    where: { AND: [{ courseId, ...ATTENDED_ENROLLMENT }, enrollmentScopeWhere(scope)] },
    orderBy: { student: { studentCode: "asc" } },
    take: ADMIN_PICKER_LIMIT,
    select: {
      student: {
        select: {
          id: true,
          studentCode: true,
          approvalStatus: true,
          user: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.student.id,
    studentCode: row.student.studentCode,
    name: row.student.user.name,
    approvalStatus: row.student.approvalStatus,
  }));
};

/** Enrolment check for a write: which of these ids really belong to the course. */
export const filterCourseStudentIds = async (
  courseId: string,
  studentIds: string[],
  scope: StaffScope
) => {
  const rows = await db.enrollment.findMany({
    where: {
      AND: [{ courseId, studentId: { in: studentIds }, ...ATTENDED_ENROLLMENT }, enrollmentScopeWhere(scope)],
    },
    select: { studentId: true },
  });
  return new Set(rows.map((row) => row.studentId));
};

export type SubmissionReviewUpdate = {
  reviewStatus: "REVIEWED" | "NEEDS_WORK";
  reviewNote: string | null;
  reviewedById: string;
};

/**
 * Record an instructor verdict. The `assignmentId` in the where clause means a
 * tampered submission id from another assignment matches nothing rather than
 * writing across tasks, and the scope adds the other half of the same rule: a
 * submission from another teacher's batch matches nothing either (fix guide §5).
 */
export const reviewSubmission = async (
  assignmentId: string,
  submissionId: string,
  data: SubmissionReviewUpdate,
  scope: StaffScope
) =>
  db.assignmentSubmission.updateMany({
    where: { AND: [{ id: submissionId, assignmentId }, submissionScopeWhere(scope)] },
    data: { ...data, reviewedAt: new Date() },
  });

export const listCoursesForAssignmentForm = async () =>
  db.course.findMany({
    orderBy: { title: "asc" },
    take: ADMIN_PICKER_LIMIT,
    select: { id: true, title: true, status: true },
  });

/**
 * Links handed in but not yet given a verdict — the number on the sidebar
 * "Assignments" badge. A re-submitted link resets to SUBMITTED, so it counts
 * again, which is exactly what an instructor needs to know.
 */
export const countSubmissionsAwaitingReview = async (scope: StaffScope): Promise<number> =>
  db.assignmentSubmission.count({
    where: { AND: [{ reviewStatus: "SUBMITTED" }, submissionScopeWhere(scope)] },
  });

// ───────────── Student portal (private, owner-scoped) ─────────────

export type StudentAssignmentView = {
  id: string;
  title: string;
  instructions: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  isNew: boolean;
  courseTitle: string;
  courseSlug: string;
  submission: {
    id: string;
    url: string;
    reviewStatus: string;
    reviewNote: string | null;
    reviewedAt: string | null;
    updatedAt: string;
  } | null;
};

/**
 * Tasks assigned to this student, each paired with their own submission (or
 * `null` when they have not answered yet).
 */
export async function listStudentAssignments(
  studentId: string
): Promise<StudentAssignmentView[]> {
  const now = new Date();
  // Sorted by nearest deadline, so the ceiling keeps the tasks that matter and
  // drops only years of history — far more than one student is ever assigned.
  const recipients = await db.assignmentRecipient.findMany({
    where: { studentId, assignment: { status: "PUBLISHED" } },
    take: ADMIN_PICKER_LIMIT,
    orderBy: [
      { assignment: { dueDate: { sort: "asc", nulls: "last" } } },
      { assignment: { createdAt: "desc" } },
    ],
    select: {
      seenAt: true,
      assignment: {
        select: {
          id: true,
          title: true,
          instructions: true,
          dueDate: true,
          course: { select: { title: true, slug: true } },
        },
      },
    },
  });
  if (recipients.length === 0) return [];

  const submissions = await db.assignmentSubmission.findMany({
    where: {
      studentId,
      assignmentId: { in: recipients.map((row) => row.assignment.id) },
    },
    select: {
      id: true,
      assignmentId: true,
      url: true,
      reviewStatus: true,
      reviewNote: true,
      reviewedAt: true,
      updatedAt: true,
    },
  });
  const byAssignment = new Map(submissions.map((row) => [row.assignmentId, row]));

  return recipients.map((recipient) => {
    const assignment = recipient.assignment;
    const mine = byAssignment.get(assignment.id);
    return {
      id: assignment.id,
      title: assignment.title,
      instructions: assignment.instructions,
      dueDate: assignment.dueDate?.toISOString() ?? null,
      // `dueDate` is midnight UTC of the selected day, so the day is still live
      // for ~6 more hours in Asia/Kathmandu — grace one full day.
      isOverdue: assignment.dueDate
        ? assignment.dueDate.getTime() + DAY_MS < now.getTime()
        : false,
      isNew: recipient.seenAt === null,
      courseTitle: assignment.course.title,
      courseSlug: assignment.course.slug,
      submission: mine
        ? {
            id: mine.id,
            url: mine.url,
            reviewStatus: mine.reviewStatus,
            reviewNote: mine.reviewNote,
            reviewedAt: mine.reviewedAt?.toISOString() ?? null,
            updatedAt: mine.updatedAt.toISOString(),
          }
        : null,
    };
  });
}

/** Unread assignments for the dashboard notice. */
export const countUnseenStudentAssignments = async (studentId: string): Promise<number> =>
  db.assignmentRecipient.count({
    where: { studentId, seenAt: null, assignment: { status: "PUBLISHED" } },
  });

/**
 * Clear the notice once the student has opened the assignments page. Returns the
 * number cleared so the caller can skip a refresh when nothing was unread.
 */
export const markStudentAssignmentsSeen = async (studentId: string): Promise<number> => {
  const result = await db.assignmentRecipient.updateMany({
    where: { studentId, seenAt: null },
    data: { seenAt: new Date() },
  });
  return result.count;
};

/**
 * Attach a link to a task assigned to this student. Returns `null` when the
 * assignment is unpublished or was never ticked for them, so a forged
 * `assignmentId` changes nothing.
 */
export async function submitAssignmentLink(
  studentId: string,
  assignmentId: string,
  url: string
): Promise<{ id: string } | null> {
  const recipient = await db.assignmentRecipient.findFirst({
    where: { studentId, assignmentId, assignment: { status: "PUBLISHED" } },
    select: { id: true },
  });
  if (!recipient) return null;

  // Re-submitting replaces the same row (the unique index would reject a second
  // one); a verdict already given resets to SUBMITTED so the instructor re-reads it.
  return db.assignmentSubmission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    create: { url, studentId, assignmentId },
    update: { url, reviewStatus: "SUBMITTED", reviewNote: null, reviewedById: null, reviewedAt: null },
    select: { id: true },
  });
}
