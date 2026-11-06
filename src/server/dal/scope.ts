import "server-only";
import type { Prisma, Role } from "@/generated/prisma/client";
import { can } from "../permissions";

/**
 * Batch scoping (fix guide §5).
 *
 * An INSTRUCTOR holds `student.read` and `assignment.read`, but the job is to
 * teach a handful of batches — not to browse the whole institute's personal
 * data. `Batch.instructorId` is the single fact these predicates are built
 * from, so the rule lives here once and every read function applies it the way
 * `leadScopeWhere` does for counselors (docs/04 §1: "own batches only").
 */

/** Who is asking. Passed into the DAL read functions, never read off the UI. */
export type StaffScope = {
  userId: string;
  role: Role;
};

/** Only ACTIVE seats count: a dropped student is no longer the teacher's. */
function enrolledInBatchOf(userId: string): Prisma.StudentProfileWhereInput {
  return {
    enrollments: {
      some: {
        status: "ACTIVE",
        batch: { instructorId: userId },
      },
    },
  };
}

/**
 * Students this staff member may list or open. Anyone except an INSTRUCTOR is
 * unrestricted here; the reduced field set is a separate question (`seesStudentPii`).
 */
export function studentScopeWhere(scope: StaffScope): Prisma.StudentProfileWhereInput {
  return scope.role === "INSTRUCTOR" ? enrolledInBatchOf(scope.userId) : {};
}

/**
 * Assignments: their own work stays visible even after a student leaves the
 * batch, plus anything currently assigned to one of their active students.
 */
export function assignmentScopeWhere(scope: StaffScope): Prisma.AssignmentWhereInput {
  if (scope.role !== "INSTRUCTOR") return {};
  return {
    OR: [
      { createdById: scope.userId },
      { recipients: { some: { student: enrolledInBatchOf(scope.userId) } } },
    ],
  };
}

/** The same rule one level down, for the recipient rows of an assignment. */
export function recipientScopeWhere(scope: StaffScope): Prisma.AssignmentRecipientWhereInput {
  if (scope.role !== "INSTRUCTOR") return {};
  return { student: enrolledInBatchOf(scope.userId) };
}

/** Submissions an instructor may see or mark: their batch's, or their own task. */
export function submissionScopeWhere(scope: StaffScope): Prisma.AssignmentSubmissionWhereInput {
  if (scope.role !== "INSTRUCTOR") return {};
  return {
    OR: [
      { student: enrolledInBatchOf(scope.userId) },
      { assignment: { createdById: scope.userId } },
    ],
  };
}

/** Batches an instructor may list: the ones that name them as the teacher. */
export function batchScopeWhere(scope: StaffScope): Prisma.BatchWhereInput {
  return scope.role === "INSTRUCTOR" ? { instructorId: scope.userId } : {};
}

/** Enrollments offered to the assignment picker for a course. */
export function enrollmentScopeWhere(scope: StaffScope): Prisma.EnrollmentWhereInput {
  if (scope.role !== "INSTRUCTOR") return {};
  return { batch: { instructorId: scope.userId } };
}

/**
 * Phone, date of birth and home address (fix guide §5.4).
 *
 * The guide's letter is "unless the role has `student.edit`", which would also
 * strip the phone from a COUNSELOR — the one role whose job is calling people.
 * The reading that keeps both jobs working: anyone who can edit the record or
 * enrol the student already handles their contact details, an instructor does
 * not. The batch roster still gets name, code and photo.
 */
export function seesStudentPii(role: Role): boolean {
  return can(role, "student.edit") || can(role, "enrollment.manage");
}
