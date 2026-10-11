"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import {
  CATEGORY_TAGS,
  COURSE_TAGS,
  courseWriteTags,
  invalidate,
} from "@/server/revalidate";
import {
  archiveCourseById,
  categoryExists,
  createCourse,
  duplicateCourseById,
  getCourseWriteSnapshot,
  mediaExists,
  restoreCourseById,
  slugIsTaken,
  updateCourse,
  type CourseWrite,
} from "@/server/dal/courses";
import {
  adminGetCategory,
  categoryGroupExists,
  categorySlugIsTaken,
  createCategory,
  updateCategory,
  type CategoryWrite,
} from "@/server/dal/categories";
import {
  courseWriteSchema,
  duplicateCourseSchema,
  categoryWriteSchema,
} from "@/lib/validators/course";

/**
 * Course and category Server Actions (docs/06 §7).
 *
 * Every action follows the same order: permission → Zod `safeParse` → DAL write
 * → `audit()` → `invalidate(tags)`. A Server Action is a public POST endpoint, so
 * permission and existence are re-checked here even though the page that renders
 * the form already did.
 */
export type CourseActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const NO_PERMISSION = "You don't have permission to do that";

function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message.includes("FORBIDDEN");
}

function invalid(error: z.ZodError): CourseActionResult<never> {
  return {
    ok: false,
    error: "Please fix the highlighted fields",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function fail(message: string): CourseActionResult<never> {
  return { ok: false, error: message };
}

/**
 * Validate the foreign keys the schema cannot: the category must be active and
 * the cover must exist in the media library.
 */
async function assertRelations(
  values: { categoryId: string; coverId: string | null }
): Promise<CourseActionResult<never> | null> {
  if (!(await categoryExists(values.categoryId))) {
    return fail("That category is not available");
  }
  if (values.coverId && !(await mediaExists(values.coverId))) {
    return fail("That cover image was not found in the media library");
  }
  return null;
}

/** Create or update, depending on whether `id` is present (docs/05 §4.4). */
export async function saveCourse(
  input: unknown
): Promise<CourseActionResult<{ id: string; slug: string; status: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("course.write");
    actor = { id: user.id, email: user.email };

    const parsed = courseWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    const id = data.id ? data.id : null;

    if (await slugIsTaken(data.slug, id ?? undefined)) {
      return {
        ok: false,
        error: "That URL is already in use",
        fieldErrors: { slug: ["Another course already uses this URL"] },
      };
    }
    const relationError = await assertRelations(data);
    if (relationError) return relationError;

    const before = id ? await getCourseWriteSnapshot(id) : null;
    if (id && !before) return fail("That course was not found");

    const values: CourseWrite = {
      title: data.title,
      slug: data.slug,
      tagline: data.tagline,
      shortDescription: data.shortDescription,
      overview: data.overview,
      categoryId: data.categoryId,
      level: data.level,
      durationWeeks: data.durationWeeks,
      learningModes: data.learningModes,
      timeSlots: data.timeSlots,
      batchFrequency: data.batchFrequency,
      targetStudents: data.targetStudents,
      prerequisites: data.prerequisites,
      instituteCertificate: data.instituteCertificate,
      industryCertifications: data.industryCertifications,
      internship: data.internship,
      seatsNote: data.seatsNote,
      feeNPR: data.feeNPR,
      feeNote: data.feeNote,
      skillsGained: data.skillsGained,
      softwareTools: data.softwareTools,
      portfolioProjects: data.portfolioProjects,
      careerOpportunities: data.careerOpportunities,
      learningObjectives: data.learningObjectives,
      ctaText: data.ctaText,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      coverId: data.coverId,
      status: data.status,
      isFeatured: data.isFeatured,
      sortOrder: data.sortOrder,
    };

    const saved = id
      ? await updateCourse(id, values, data.featuredOrder)
      : await createCourse(values, data.featuredOrder);

    await audit({
      actor,
      action: id ? "course.update" : "course.create",
      entity: "Course",
      entityId: saved.id,
      summary: `${id ? "Updated" : "Created"} ${data.title} (${saved.status})`,
      meta: {
        slug: saved.slug,
        status: saved.status,
        previousStatus: before?.status ?? null,
        categoryChanged: before ? before.categoryId !== data.categoryId : null,
      },
    });

    // Both slugs are invalidated: renaming a course must also drop the old URL.
    invalidate(...courseWriteTags([before?.slug, saved.slug]));

    return { ok: true, data: saved };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error("[saveCourse]", error instanceof Error ? error.message : "unknown");
    return fail(GENERIC_FAILURE);
  }
}

/** Archive / restore (docs/05 §4.4). Archiving 404s the public page at once. */
export async function setCourseArchived(
  input: unknown
): Promise<CourseActionResult<{ id: string; slug: string; status: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("course.archive");
    actor = { id: user.id, email: user.email };

    const parsed = z
      .object({ id: z.string().trim().min(1).max(64), archived: z.boolean() })
      .safeParse(input);
    if (!parsed.success) return fail("Invalid request");

    const before = await getCourseWriteSnapshot(parsed.data.id);
    if (!before) return fail("That course was not found");
    const alreadyArchived = before.status === "ARCHIVED";
    if (alreadyArchived === parsed.data.archived) {
      return fail("That course is already in that state");
    }

    const result = parsed.data.archived
      ? await archiveCourseById(parsed.data.id)
      : await restoreCourseById(parsed.data.id);

    await audit({
      actor,
      action: parsed.data.archived ? "course.archive" : "course.restore",
      entity: "Course",
      entityId: result.id,
      summary: `${parsed.data.archived ? "Archived" : "Restored"} ${result.slug}`,
      meta: { from: before.status },
    });

    invalidate(...courseWriteTags([result.slug]));
    return { ok: true, data: { ...result, status: parsed.data.archived ? "ARCHIVED" : "DRAFT" } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[setCourseArchived]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

/** Quick "duplicate as draft", kept as an unpublished copy (docs/05 §4.4). */
export async function duplicateCourse(
  input: unknown
): Promise<CourseActionResult<{ id: string; slug: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("course.write");
    actor = { id: user.id, email: user.email };

    const parsed = duplicateCourseSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    if (await slugIsTaken(parsed.data.slug)) {
      return {
        ok: false,
        error: "That URL is already in use",
        fieldErrors: { slug: ["Another course already uses this URL"] },
      };
    }

    const copy = await duplicateCourseById(parsed.data.id, parsed.data.slug);

    await audit({
      actor,
      action: "course.duplicate",
      entity: "Course",
      entityId: copy.id,
      summary: `Duplicated course as draft ${copy.slug}`,
      meta: { sourceId: parsed.data.id },
    });

    invalidate(...COURSE_TAGS);
    return { ok: true, data: copy };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error("[duplicateCourse]", error instanceof Error ? error.message : "unknown");
    return fail(GENERIC_FAILURE);
  }
}

/** Category create/update (docs/05 §4.4, permission `category.manage`). */
export async function saveCategory(
  input: unknown
): Promise<CourseActionResult<{ id: string; slug: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("category.manage");
    actor = { id: user.id, email: user.email };

    const parsed = categoryWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    const id = data.id ? data.id : null;

    if (await categorySlugIsTaken(data.slug, id ?? undefined)) {
      return {
        ok: false,
        error: "That URL is already in use",
        fieldErrors: { slug: ["Another category already uses this URL"] },
      };
    }
    if (!(await categoryGroupExists(data.groupId))) {
      return { ok: false, error: "That category group is not available" };
    }

    const before = id ? await adminGetCategory(id) : null;
    if (id && !before) return fail("That category was not found");

    const values: CategoryWrite = {
      groupId: data.groupId,
      name: data.name,
      slug: data.slug,
      description: data.description,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    };

    const saved = id
      ? await updateCategory(id, values)
      : await createCategory(values);

    await audit({
      actor,
      action: id ? "category.update" : "category.create",
      entity: "Category",
      entityId: saved.id,
      summary: `${id ? "Updated" : "Created"} category ${saved.slug}`,
      meta: { slug: saved.slug, isActive: data.isActive },
    });

    // Categories feed the catalog filters, the directory counts and the sitemap.
    invalidate(...CATEGORY_TAGS, ...COURSE_TAGS);
    return { ok: true, data: saved };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error("[saveCategory]", error instanceof Error ? error.message : "unknown");
    return fail(GENERIC_FAILURE);
  }
}
