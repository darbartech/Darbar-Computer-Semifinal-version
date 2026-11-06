import { describe, it, expect } from "vitest";
import type { Role } from "../src/generated/prisma/client";
import {
  assignmentScopeWhere,
  batchScopeWhere,
  enrollmentScopeWhere,
  recipientScopeWhere,
  seesStudentPii,
  studentScopeWhere,
  submissionScopeWhere,
} from "../src/server/dal/scope";

const INSTRUCTOR = { userId: "usr_teacher", role: "INSTRUCTOR" as Role };
const ADMIN = { userId: "usr_office", role: "ADMIN" as Role };
const COUNSELOR = { userId: "usr_counsel", role: "COUNSELOR" as Role };
const RECEPTION = { userId: "usr_desk", role: "RECEPTION" as Role };

/**
 * Fix guide §5: an INSTRUCTOR reads their own batches and nothing else. These
 * are the predicates every scoped DAL function folds into its `where`, so they
 * are asserted as data — the shape Prisma receives is the whole rule.
 */
describe("INSTRUCTOR batch scope", () => {
  it("limits a student read to ACTIVE seats in the teacher's batches", () => {
    expect(studentScopeWhere(INSTRUCTOR)).toEqual({
      enrollments: { some: { status: "ACTIVE", batch: { instructorId: "usr_teacher" } } },
    });
  });

  it("leaves every other role unrestricted", () => {
    for (const scope of [ADMIN, COUNSELOR, RECEPTION]) {
      expect(studentScopeWhere(scope)).toEqual({});
      expect(assignmentScopeWhere(scope)).toEqual({});
      expect(batchScopeWhere(scope)).toEqual({});
      expect(recipientScopeWhere(scope)).toEqual({});
      expect(submissionScopeWhere(scope)).toEqual({});
      expect(enrollmentScopeWhere(scope)).toEqual({});
    }
  });

  it("keeps an instructor's own assignments visible", () => {
    expect(assignmentScopeWhere(INSTRUCTOR)).toEqual({
      OR: [
        { createdById: "usr_teacher" },
        {
          recipients: {
            some: {
              student: {
                enrollments: { some: { status: "ACTIVE", batch: { instructorId: "usr_teacher" } } },
              },
            },
          },
        },
      ],
    });
  });

  it("narrows the batch list, the roster and the picker the same way", () => {
    expect(batchScopeWhere(INSTRUCTOR)).toEqual({ instructorId: "usr_teacher" });
    expect(recipientScopeWhere(INSTRUCTOR)).toEqual({
      student: {
        enrollments: { some: { status: "ACTIVE", batch: { instructorId: "usr_teacher" } } },
      },
    });
    expect(enrollmentScopeWhere(INSTRUCTOR)).toEqual({
      batch: { instructorId: "usr_teacher" },
    });
    expect(submissionScopeWhere(INSTRUCTOR)).toEqual({
      OR: [
        {
          student: {
            enrollments: { some: { status: "ACTIVE", batch: { instructorId: "usr_teacher" } } },
          },
        },
        { assignment: { createdById: "usr_teacher" } },
      ],
    });
  });
});

describe("who may see a student's contact details", () => {
  it("keeps them with the roles that edit or enrol", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "RECEPTION", "COUNSELOR"] as Role[]) {
      expect(seesStudentPii(role)).toBe(true);
    }
  });

  it("hides them from the teacher and from every other staff role", () => {
    for (const role of ["INSTRUCTOR", "EDITOR", "ACCOUNTANT", "STUDENT"] as Role[]) {
      expect(seesStudentPii(role)).toBe(false);
    }
  });
});
