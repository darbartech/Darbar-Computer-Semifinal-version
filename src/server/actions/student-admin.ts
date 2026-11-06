"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit } from "@/server/services/audit";
import { invalidate, BATCH_TAGS, STUDENT_TAGS } from "@/server/revalidate";
import {
  BatchFullError,
  approveEnrollment,
  completeEnrollment,
  declineEnrollment,
  moveEnrollmentBatch,
  setStudentApproval,
  waitlistEnrollment,
} from "@/server/dal/students";
import {
  approveEnrollmentSchema,
  completeEnrollmentSchema,
  declineEnrollmentSchema,
  moveEnrollmentSchema,
  rejectStudentSchema,
  studentIdSchema,
  waitlistEnrollmentSchema,
} from "@/lib/validators/student";

/**
 * Staff-side registration approval (docs/04 §2): requirePermission → Zod →
 * DAL → audit → invalidate → ActionResult. A student stays locked out of
 * portal writes until approveStudentAction runs.
 */

export type StudentAdminResult<T = unknown> =
  | { ok: true; data: T }
  /** `batchFull` tells the review UI to show the waiting-list button. */
  | { ok: false; error: string; batchFull?: boolean };

const GENERIC_FAILURE = "Something went wrong. Please try again.";

function invalid(error: z.ZodError): StudentAdminResult<never> {
  const first = Object.values(z.flattenError(error).fieldErrors)
    .flat()
    .find((message): message is string => typeof message === "string");
  return { ok: false, error: first ?? "Please fix the highlighted fields" };
}

export async function approveStudentAction(
  input: unknown
): Promise<StudentAdminResult<{ id: string }>> {
  try {
    const admin = await requirePermission("student.approve");
    const parsed = studentIdSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const updated = await setStudentApproval(parsed.data.id, "APPROVED", admin.id);
    if (!updated) return { ok: false, error: "Student not found" };

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: "student.approve",
      entity: "StudentProfile",
      entityId: parsed.data.id,
      summary: "Approved student registration",
    });
    invalidate(...STUDENT_TAGS);
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[approveStudentAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function rejectStudentAction(
  input: unknown
): Promise<StudentAdminResult<{ id: string }>> {
  try {
    const admin = await requirePermission("student.approve");
    const parsed = rejectStudentSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const updated = await setStudentApproval(
      parsed.data.id,
      "REJECTED",
      admin.id,
      parsed.data.reason
    );
    if (!updated) return { ok: false, error: "Student not found" };

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: "student.reject",
      entity: "StudentProfile",
      entityId: parsed.data.id,
      summary: "Rejected student registration",
    });
    invalidate(...STUDENT_TAGS);
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[rejectStudentAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/**
 * Staff decisions on course requests (docs 02 B1/B6). Every one of them is a
 * seat transition, so `BATCH_TAGS` is invalidated alongside `STUDENT_TAGS`:
 * the public course pages print "Seats left" from the cached batch list.
 *
 * `BatchFullError` is caught rather than collapsed into GENERIC_FAILURE — the
 * UI needs to know the request is still pending so it can offer the waiting
 * list. No seat, batch or audit write survives the rolled-back transaction.
 */

const BATCH_FULL_HINT =
  "That batch has no free seats. The request is still pending — add the student to the waiting list instead.";

type DecisionArgs = {
  enrollmentId: string;
  action: string;
  summary: string;
  result: { ok: true } | { ok: false; error: string };
  admin: { id: string; email: string };
  meta?: Record<string, string>;
};

async function finishDecision({
  enrollmentId,
  action,
  summary,
  result,
  admin,
  meta,
}: DecisionArgs): Promise<StudentAdminResult<{ enrollmentId: string }>> {
  if (!result.ok) return { ok: false, error: result.error };
  await audit({
    actor: { id: admin.id, email: admin.email },
    action,
    entity: "Enrollment",
    entityId: enrollmentId,
    summary,
    meta,
  });
  invalidate(...STUDENT_TAGS, ...BATCH_TAGS);
  return { ok: true, data: { enrollmentId } };
}

export async function approveEnrollmentAction(
  input: unknown
): Promise<StudentAdminResult<{ enrollmentId: string }>> {
  try {
    const admin = await requirePermission("student.approve");
    const parsed = approveEnrollmentSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const result = await approveEnrollment(
      parsed.data.enrollmentId,
      parsed.data.batchId,
      admin.id
    );
    return await finishDecision({
      enrollmentId: parsed.data.enrollmentId,
      action: "enrollment.approve",
      summary: "Approved enrollment request into a batch",
      result,
      admin,
      meta: { batchId: parsed.data.batchId },
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof BatchFullError) {
      return { ok: false, error: BATCH_FULL_HINT, batchFull: true };
    }
    console.error(
      "[approveEnrollmentAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function waitlistEnrollmentAction(
  input: unknown
): Promise<StudentAdminResult<{ enrollmentId: string }>> {
  try {
    const admin = await requirePermission("student.approve");
    const parsed = waitlistEnrollmentSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const result = await waitlistEnrollment(
      parsed.data.enrollmentId,
      admin.id,
      parsed.data.note?.trim() || null,
      parsed.data.batchId || null
    );
    return await finishDecision({
      enrollmentId: parsed.data.enrollmentId,
      action: "enrollment.waitlist",
      summary: "Added enrollment request to the waiting list",
      result,
      admin,
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[waitlistEnrollmentAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function declineEnrollmentAction(
  input: unknown
): Promise<StudentAdminResult<{ enrollmentId: string }>> {
  try {
    const admin = await requirePermission("student.approve");
    const parsed = declineEnrollmentSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const result = await declineEnrollment(
      parsed.data.enrollmentId,
      admin.id,
      parsed.data.note
    );
    return await finishDecision({
      enrollmentId: parsed.data.enrollmentId,
      action: "enrollment.decline",
      summary: "Declined enrollment request",
      result,
      admin,
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[declineEnrollmentAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function moveEnrollmentBatchAction(
  input: unknown
): Promise<StudentAdminResult<{ enrollmentId: string }>> {
  try {
    const admin = await requirePermission("student.approve");
    const parsed = moveEnrollmentSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const result = await moveEnrollmentBatch(
      parsed.data.enrollmentId,
      parsed.data.batchId,
      admin.id
    );
    return await finishDecision({
      enrollmentId: parsed.data.enrollmentId,
      action: "enrollment.move",
      summary: "Moved enrollment to another batch",
      result,
      admin,
      meta: { batchId: parsed.data.batchId },
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof BatchFullError) {
      return { ok: false, error: "That batch has no free seats. The student kept their current batch." };
    }
    console.error(
      "[moveEnrollmentBatchAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function completeEnrollmentAction(
  input: unknown
): Promise<StudentAdminResult<{ enrollmentId: string }>> {
  try {
    const admin = await requirePermission("student.approve");
    const parsed = completeEnrollmentSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const result = await completeEnrollment(parsed.data.enrollmentId, admin.id);
    return await finishDecision({
      enrollmentId: parsed.data.enrollmentId,
      action: "enrollment.complete",
      summary: "Marked enrollment completed",
      result,
      admin,
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[completeEnrollmentAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}
