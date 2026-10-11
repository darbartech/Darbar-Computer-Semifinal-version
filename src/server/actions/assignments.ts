"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { ASSIGNMENT_TAGS, invalidate } from "@/server/revalidate";
import {
  assignmentWriteSchema,
  submissionReviewSchema,
} from "@/lib/validators/assignments";
import {
  adminGetAssignment,
  createAssignment,
  deleteAssignment,
  filterCourseStudentIds,
  listCourseStudents,
  reviewSubmission,
  updateAssignment,
} from "@/server/dal/assignments";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";

function invalid(error: z.ZodError): ActionResult<never> {
  return {
    ok: false,
    error: "Please fix the highlighted fields",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function fail(message: string): ActionResult<never> {
  return { ok: false, error: message };
}

/**
 * Create or update one assignment. `id` decides which, the same way `saveBatch`
 * does, so the client form can post one payload for both cases. The ticked
 * student list replaces whatever was stored before, and every id is re-checked
 * against the course's enrolments so a tampered form cannot hand a task to a
 * student who is not on it.
 */
export async function saveAssignmentAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("assignment.write");
    actor = { id: user.id, email: user.email };

    const parsed = assignmentWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    const dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      return { ok: false, error: "Please fix the highlighted fields", fieldErrors: { dueDate: ["Enter a valid date"] } };
    }

    const studentIds = [...new Set(data.studentIds)];
    const enrolled = await filterCourseStudentIds(data.courseId, studentIds);
    if (enrolled.size !== studentIds.length) {
      return fail("Some of the chosen students are not enrolled in that course");
    }

    const fields = {
      title: data.title,
      instructions: data.instructions || null,
      dueDate,
      status: data.status,
      courseId: data.courseId,
      studentIds,
    };

    const id = data.id && data.id !== "" ? data.id : null;
    if (id) {
      if (!(await adminGetAssignment(id))) return fail("Assignment not found");
      await updateAssignment(id, fields);
      await audit({
        actor,
        action: "assignment.update",
        entity: "Assignment",
        entityId: id,
        summary: "Updated assignment",
        meta: { status: data.status, recipients: studentIds.length },
      });
      invalidate(...ASSIGNMENT_TAGS);
      return { ok: true, data: { id } };
    }

    const created = await createAssignment({ ...fields, createdById: user.id });
    await audit({
      actor,
      action: "assignment.create",
      entity: "Assignment",
      entityId: created.id,
      summary: "Created assignment",
      meta: { status: data.status, recipients: studentIds.length },
    });
    invalidate(...ASSIGNMENT_TAGS);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[saveAssignmentAction]", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** The students a picker can offer for one course. Read-gated like the list page. */
export async function listCourseStudentsAction(
  courseId: string
): Promise<
  ActionResult<{
    students: { id: string; name: string; studentCode: string; approvalStatus: string }[];
  }>
> {
  try {
    await requirePermission("assignment.read");
    const parsed = z.string().trim().min(1).max(64).safeParse(courseId);
    if (!parsed.success) return fail("Invalid course");
    return { ok: true, data: { students: await listCourseStudents(parsed.data) } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[listCourseStudentsAction]", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deleteAssignmentAction(id: string): Promise<ActionResult> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("assignment.write");
    actor = { id: user.id, email: user.email };

    if (!(await adminGetAssignment(id))) return fail("Assignment not found");
    await deleteAssignment(id);
    await audit({
      actor,
      action: "assignment.delete",
      entity: "Assignment",
      entityId: id,
      summary: "Deleted assignment",
    });
    invalidate(...ASSIGNMENT_TAGS);
    return { ok: true, data: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[deleteAssignmentAction]", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** Mark a student's link REVIEWED or NEEDS_WORK, with an optional short note. */
export async function reviewSubmissionAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("assignment.write");
    actor = { id: user.id, email: user.email };

    const parsed = submissionReviewSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    const result = await reviewSubmission(data.assignmentId, data.submissionId, {
      reviewStatus: data.reviewStatus,
      reviewNote: data.reviewNote || null,
      reviewedById: user.id,
    });
    if (result.count === 0) return fail("Submission not found");

    await audit({
      actor,
      action: "assignment.submission.review",
      entity: "AssignmentSubmission",
      entityId: data.submissionId,
      summary: "Reviewed assignment submission",
      meta: { status: data.reviewStatus },
    });
    invalidate(...ASSIGNMENT_TAGS);
    return { ok: true, data: { id: data.submissionId } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[reviewSubmissionAction]", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: GENERIC_FAILURE };
  }
}
