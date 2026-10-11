"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit } from "@/server/services/audit";
import { invalidate, STUDENT_TAGS } from "@/server/revalidate";
import {
  setEnrollmentDecision,
  setStudentApproval,
} from "@/server/dal/students";
import {
  enrollmentDecisionSchema,
  rejectStudentSchema,
  studentIdSchema,
} from "@/lib/validators/student";

/**
 * Staff-side registration approval (docs/04 §2): requirePermission → Zod →
 * DAL → audit → invalidate → ActionResult. A student stays locked out of
 * portal writes until approveStudentAction runs.
 */

export type StudentAdminResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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

export async function setEnrollmentDecisionAction(
  input: unknown
): Promise<StudentAdminResult<{ enrollmentId: string; status: string }>> {
  try {
    const admin = await requirePermission("student.approve");
    const parsed = enrollmentDecisionSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const result = await setEnrollmentDecision(
      parsed.data.enrollmentId,
      parsed.data.status
    );
    if (!result.ok) return { ok: false, error: result.error };

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: parsed.data.status === "ACTIVE" ? "enrollment.approve" : "enrollment.decline",
      entity: "Enrollment",
      entityId: parsed.data.enrollmentId,
      summary:
        parsed.data.status === "ACTIVE"
          ? "Approved enrollment request"
          : "Declined enrollment request",
    });
    invalidate(...STUDENT_TAGS);
    return { ok: true, data: { enrollmentId: parsed.data.enrollmentId, status: parsed.data.status } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[setEnrollmentDecisionAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}
