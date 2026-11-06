"use server";
import "server-only";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit } from "@/server/services/audit";
import { requireStepUp } from "@/server/services/step-up";
import { invalidate, PORTFOLIO_TAGS, STUDENT_TAGS, USER_TAGS } from "@/server/revalidate";
import {
  collectStudentData,
  eraseStudentIdentity,
  removeErasedPhoto,
} from "@/server/dal/student-privacy";
import { studentIdSchema } from "@/lib/validators/student";

/**
 * Student data requests (brief task 9, docs 01 S13).
 *
 * Both halves leave the building: one sends a person's whole file out, the other
 * destroys the identity in it. So both ask for a role that does not exist
 * anywhere else in the matrix (`student.export`, `student.erase` — SUPER_ADMIN
 * only), both ask for the authenticator code at the moment of the click, and both
 * write an audit entry that says how many rows moved, never what they said.
 */

export type StudentPrivacyResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const NOT_FOUND = "Student not found";

/**
 * The one entry point for "what do you hold about me".
 *
 * The document goes back in the action's return value rather than through a
 * download URL, because the proof of who is asking is a code in this request's
 * body — and a URL that carried it would be the same file, one browser history
 * entry away from anyone using that machine.
 */
export async function exportStudentDataAction(
  input: unknown
): Promise<StudentPrivacyResult<{ filename: string; document: unknown }>> {
  try {
    const admin = await requirePermission("student.export");

    const parsed = studentIdSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "This does not look like a student id." };

    const stepUp = await requireStepUp(admin, "student.export", input);
    if (!stepUp.ok) return { ok: false, error: stepUp.error };

    const collected = await collectStudentData(parsed.data.id);
    if (!collected) return { ok: false, error: NOT_FOUND };

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: "student.export",
      entity: "StudentProfile",
      entityId: parsed.data.id,
      summary: "Exported one student's complete data record",
      // Row counts, nothing else. The file itself was the sensitive part and it
      // went to the person who proved the second factor.
      meta: collected.counts,
    });
    return { ok: true, data: { filename: collected.filename, document: collected.document } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[exportStudentDataAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/**
 * Erase a student's identity, keeping the ledger.
 *
 * There is no undo button for this one, which is why the click needs the phone in
 * hand. What survives is deliberate — invoices, receipts, enrollments and issued
 * certificates (`src/server/dal/student-privacy.ts` lists the reasons); what goes
 * is every field that says who the person is.
 */
export async function eraseStudentDataAction(
  input: unknown
): Promise<StudentPrivacyResult<{ id: string }>> {
  try {
    const admin = await requirePermission("student.erase");

    const parsed = studentIdSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "This does not look like a student id." };

    const stepUp = await requireStepUp(admin, "student.erase", input);
    if (!stepUp.ok) return { ok: false, error: stepUp.error };

    const erased = await eraseStudentIdentity(parsed.data.id);
    if (!erased) return { ok: false, error: NOT_FOUND };

    // Last, and best-effort: a storage timeout must not report a failed erasure
    // after the identity fields are already gone.
    if (erased.photoMediaId) {
      await removeErasedPhoto(erased.photoMediaId, erased.photoPublicId);
    }

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: "student.erase",
      entity: "StudentProfile",
      entityId: parsed.data.id,
      summary: "Erased a student's identity; financial records kept",
      meta: {
        fieldsCleared: erased.nameCleared,
        projectsCleared: erased.projectsCleared,
        submissionsCleared: erased.submissionsCleared,
        sessionsRevoked: erased.sessionsRevoked,
        credentialsCleared: erased.credentialsCleared,
        twoFactorCleared: erased.twoFactorCleared,
        photoRemoved: Boolean(erased.photoMediaId),
      },
    });
    invalidate(...STUDENT_TAGS, ...USER_TAGS, ...PORTFOLIO_TAGS);
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[eraseStudentDataAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}
