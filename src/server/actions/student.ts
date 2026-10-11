"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError } from "@/server/session";
import { requireApprovedStudentProfile } from "@/server/student-session";
import { audit } from "@/server/services/audit";
import { invalidate, portfolioWriteTags, STUDENT_TAGS } from "@/server/revalidate";
import { destroyAsset } from "@/server/services/storage";
import { storeAvatarImage } from "@/server/services/avatar";
import { STUDENT_PHOTO_FOLDER } from "@/server/constants";
import { createMedia } from "@/server/dal/media";
import { submitAssignmentLink, markStudentAssignmentsSeen } from "@/server/dal/assignments";
import {
  createStudentProject,
  deleteStudentProject,
  deleteStudentPhotoMedia,
  isPortfolioSlugTaken,
  replaceStudentPhoto,
  requestCourseEnrollment,
  updateStudentProfile,
  updateStudentProject,
} from "@/server/dal/students";
import {
  courseEnrollmentRequestSchema,
  portfolioProjectIdSchema,
  portfolioProjectSchema,
  studentProfileSchema,
} from "@/lib/validators/student";
import { submissionWriteSchema } from "@/lib/validators/assignments";

/**
 * Student-owned writes. There is no staff permission matrix here: the guard is
 * `requireStudentProfile()`, which resolves the caller's own profile, and every
 * write is scoped to that profile id (docs/04 §2 pattern, role replaced by
 * ownership). Each action returns an ActionResult and invalidates the public
 * portfolio cache (docs/06 §7).
 */

export type StudentActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";

function invalid(error: z.ZodError): StudentActionResult<never> {
  return {
    ok: false,
    error: "Please fix the highlighted fields",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

export async function updateStudentProfileAction(
  input: unknown
): Promise<StudentActionResult<{ id: string }>> {
  let actor: { id: string; email: string } | null = null;
  try {
    const guard = await requireApprovedStudentProfile();
    if (!guard.ok) return { ok: false, error: guard.error };
    const { user, profile } = guard;
    actor = { id: user.id, email: user.email };

    const parsed = studentProfileSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const slug = parsed.data.portfolioSlug || null;
    if (slug && (await isPortfolioSlugTaken(slug, profile.id))) {
      return {
        ok: false,
        error: "That portfolio URL is already taken",
        fieldErrors: { portfolioSlug: ["Already taken"] },
      };
    }

    const updated = await updateStudentProfile(profile.id, parsed.data);

    await audit({
      actor,
      action: "student.profile.update",
      entity: "StudentProfile",
      entityId: profile.id,
      summary: "Updated student profile",
      meta: { portfolioPublic: updated.portfolioPublic, hasSlug: Boolean(updated.portfolioSlug) },
    });

    invalidate(
      ...portfolioWriteTags(profile.portfolioSlug),
      ...portfolioWriteTags(updated.portfolioSlug),
      ...STUDENT_TAGS
    );
    return { ok: true, data: { id: updated.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[updateStudentProfileAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function savePortfolioProjectAction(
  input: unknown
): Promise<StudentActionResult<{ id: string }>> {
  let actor: { id: string; email: string } | null = null;
  try {
    const guard = await requireApprovedStudentProfile();
    if (!guard.ok) return { ok: false, error: guard.error };
    const { user, profile } = guard;
    actor = { id: user.id, email: user.email };

    const parsed = portfolioProjectSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const values = parsed.data;

    const data = {
      title: values.title,
      description: values.description || null,
      techStack: values.techStack,
      liveUrl: values.liveUrl || null,
      repoUrl: values.repoUrl || null,
      isPublished: values.isPublished,
      sortOrder: values.sortOrder,
    };

    const id = values.id;
    const saved = id
      ? await updateStudentProject(profile.id, id, data)
      : await createStudentProject(profile.id, data);

    if (!saved) return { ok: false, error: "Project not found" };

    await audit({
      actor,
      action: id ? "student.project.update" : "student.project.create",
      entity: "PortfolioProject",
      entityId: saved.id,
      summary: id ? "Updated portfolio project" : "Added portfolio project",
    });

    invalidate(...portfolioWriteTags(profile.portfolioSlug), ...STUDENT_TAGS);
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[savePortfolioProjectAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deletePortfolioProjectAction(
  input: unknown
): Promise<StudentActionResult<{ id: string }>> {
  let actor: { id: string; email: string } | null = null;
  try {
    const guard = await requireApprovedStudentProfile();
    if (!guard.ok) return { ok: false, error: guard.error };
    const { user, profile } = guard;
    actor = { id: user.id, email: user.email };

    const parsed = portfolioProjectIdSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const removed = await deleteStudentProject(profile.id, parsed.data.id);
    if (!removed) return { ok: false, error: "Project not found" };

    await audit({
      actor,
      action: "student.project.delete",
      entity: "PortfolioProject",
      entityId: parsed.data.id,
      summary: "Deleted portfolio project",
    });

    invalidate(...portfolioWriteTags(profile.portfolioSlug), ...STUDENT_TAGS);
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[deletePortfolioProjectAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function requestCourseEnrollmentAction(
  input: unknown
): Promise<StudentActionResult<{ status: "PENDING" }>> {
  let actor: { id: string; email: string } | null = null;
  try {
    const guard = await requireApprovedStudentProfile();
    if (!guard.ok) return { ok: false, error: guard.error };
    const { user, profile } = guard;
    actor = { id: user.id, email: user.email };

    const parsed = courseEnrollmentRequestSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const result = await requestCourseEnrollment(profile.id, parsed.data.courseId);
    if (!result) return { ok: false, error: "This course is no longer available" };
    if (result.kind === "existing") {
      return {
        ok: false,
        error:
          result.status === "PENDING"
            ? "You already have a request waiting for approval"
            : "You are already enrolled in this course",
      };
    }

    await audit({
      actor,
      action: "student.enrollment.request",
      entity: "Enrollment",
      entityId: profile.id,
      summary: "Requested course enrollment",
      meta: { courseId: parsed.data.courseId },
    });

    invalidate(...STUDENT_TAGS);
    return { ok: true, data: { status: "PENDING" } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[requestCourseEnrollmentAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/**
 * Profile photo upload for approved students. Unlike staff media (signed
 * browser-to-Cloudinary flow), the file travels through this action and is
 * uploaded server-side with Basic auth against the Cloudinary API, so the
 * account secret never reaches the browser and no student gets `media.upload`.
 * The replaced photo is destroyed and its `Media` row removed.
 */
export async function uploadStudentPhotoAction(
  formData: FormData
): Promise<StudentActionResult<{ photoUrl: string }>> {
  let actor: { id: string; email: string } | null = null;
  try {
    const guard = await requireApprovedStudentProfile();
    if (!guard.ok) return { ok: false, error: guard.error };
    const { user, profile } = guard;
    actor = { id: user.id, email: user.email };

    const file = formData.get("file");
    const storedResult = await storeAvatarImage(file, STUDENT_PHOTO_FOLDER);
    if (!storedResult.ok) return { ok: false, error: storedResult.error };
    const stored = storedResult.stored;

    const media = await createMedia({
      url: stored.url,
      publicId: stored.publicId,
      alt: `${profile.name}'s profile photo`,
      width: stored.width,
      height: stored.height,
      bytes: stored.bytes,
      mimeType: stored.mimeType,
      folder: STUDENT_PHOTO_FOLDER,
      uploadedById: user.id,
    });

    const replaced = await replaceStudentPhoto(profile.id, media.id);
    if (replaced.replacedMediaId) {
      if (replaced.replacedPublicId) await destroyAsset(replaced.replacedPublicId);
      await deleteStudentPhotoMedia(replaced.replacedMediaId);
    }

    await audit({
      actor,
      action: "student.photo.upload",
      entity: "StudentProfile",
      entityId: profile.id,
      summary: "Updated profile photo",
      meta: { mimeType: stored.mimeType, bytes: stored.bytes },
    });

    invalidate(
      ...portfolioWriteTags(profile.portfolioSlug),
      ...STUDENT_TAGS
    );
    return { ok: true, data: { photoUrl: stored.url } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[uploadStudentPhotoAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/**
 * Submit (or replace) the link for one assignment. The DAL only writes when the
 * task is published AND belongs to a course this student is enrolled in, so a
 * forged `assignmentId` for someone else's course changes nothing.
 */
export async function submitAssignmentAction(
  input: unknown
): Promise<StudentActionResult<{ id: string }>> {
  let actor: { id: string; email: string } | null = null;
  try {
    const guard = await requireApprovedStudentProfile();
    if (!guard.ok) return { ok: false, error: guard.error };
    const { user, profile } = guard;
    actor = { id: user.id, email: user.email };

    const parsed = submissionWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const saved = await submitAssignmentLink(profile.id, parsed.data.assignmentId, parsed.data.url);
    if (!saved) return { ok: false, error: "This assignment is not available for your courses" };

    await audit({
      actor,
      action: "assignment.submission.submit",
      entity: "AssignmentSubmission",
      entityId: saved.id,
      summary: "Submitted assignment link",
    });

    invalidate(...STUDENT_TAGS);
    return { ok: true, data: saved };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[submitAssignmentAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/**
 * Clear the "new assignment" notice. Fired by the assignments page after it has
 * rendered, never during a GET, so reading the list is not a side effect.
 */
export async function markAssignmentsSeenAction(): Promise<
  StudentActionResult<{ cleared: number }>
> {
  try {
    const guard = await requireApprovedStudentProfile();
    if (!guard.ok) return { ok: false, error: guard.error };

    const cleared = await markStudentAssignmentsSeen(guard.profile.id);
    return { ok: true, data: { cleared } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[markAssignmentsSeenAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}
