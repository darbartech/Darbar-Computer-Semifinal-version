"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { TESTIMONIAL_TAGS, invalidate } from "@/server/revalidate";
import { testimonialWriteSchema } from "@/lib/validators/testimonials";
import { adminGetTestimonial, createTestimonial, deleteTestimonial, updateTestimonial } from "@/server/dal/testimonials";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";

function invalid(error: z.ZodError): ActionResult<never> {
  return { ok: false, error: "Please fix the highlighted fields", fieldErrors: z.flattenError(error).fieldErrors };
}
function fail(message: string): ActionResult<never> {
  return { ok: false, error: message };
}

export async function saveTestimonial(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("testimonials.write");
    actor = { id: user.id, email: user.email };
    const parsed = testimonialWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    const id = data.id ? data.id : null;
    let result;
    if (id) {
      if (!(await adminGetTestimonial(id))) return fail("Testimonial not found");
      result = await updateTestimonial(id, {
        name: data.name,
        course: data.courseId ? { connect: { id: data.courseId } } : { disconnect: true },
        courseLabel: data.courseLabel,
        quote: data.quote,
        rating: data.rating,
        photo: data.photoId ? { connect: { id: data.photoId } } : { disconnect: true },
        consentGiven: data.consentGiven,
        consentNote: data.consentNote,
        isPublished: data.isPublished,
        sortOrder: data.sortOrder,
      });
      if (actor) await audit({ actor, action: "testimonial.update", entity: "Testimonial", entityId: result.id });
    } else {
      result = await createTestimonial({
        name: data.name,
        course: data.courseId ? { connect: { id: data.courseId } } : undefined,
        courseLabel: data.courseLabel,
        quote: data.quote,
        rating: data.rating,
        photo: data.photoId ? { connect: { id: data.photoId } } : undefined,
        consentGiven: data.consentGiven,
        consentNote: data.consentNote,
        isPublished: data.isPublished,
        sortOrder: data.sortOrder,
      });
      if (actor) await audit({ actor, action: "testimonial.create", entity: "Testimonial", entityId: result.id });
    }
    invalidate(...TESTIMONIAL_TAGS);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deleteTestimonialAction(id: string): Promise<ActionResult> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("testimonials.write");
    actor = { id: user.id, email: user.email };
    await deleteTestimonial(id);
    if (actor) await audit({ actor, action: "testimonial.delete", entity: "Testimonial", entityId: id });
    invalidate(...TESTIMONIAL_TAGS);
    return { ok: true, data: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

