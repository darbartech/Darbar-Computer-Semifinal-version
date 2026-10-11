"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { FAQ_TAGS, invalidate } from "@/server/revalidate";
import { faqCategoryWriteSchema, faqWriteSchema } from "@/lib/validators/faq";
import { createFaq, createFaqCategory, deleteFaq, getFaq, getFaqCategory, updateFaq, updateFaqCategory } from "@/server/dal/faq";

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

export async function saveFaqCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("faq.write");
    actor = { id: user.id, email: user.email };
    const parsed = faqCategoryWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    const id = data.id ? data.id : null;
    let result;
    if (id) {
      if (!(await getFaqCategory(id))) return fail("Category not found");
      result = await updateFaqCategory(id, { name: data.name, sortOrder: data.sortOrder });
      if (actor) await audit({ actor, action: "faq.category.update", entity: "FaqCategory", entityId: result.id });
    } else {
      result = await createFaqCategory({ name: data.name, sortOrder: data.sortOrder });
      if (actor) await audit({ actor, action: "faq.category.create", entity: "FaqCategory", entityId: result.id });
    }
    invalidate(...FAQ_TAGS);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function saveFaq(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("faq.write");
    actor = { id: user.id, email: user.email };
    const parsed = faqWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    const id = data.id ? data.id : null;
    let result;
    if (id) {
      if (!(await getFaq(id))) return fail("FAQ not found");
      result = await updateFaq(id, { category: { connect: { id: data.categoryId } }, question: data.question, answer: data.answer, sortOrder: data.sortOrder, isPublished: data.isPublished });
      if (actor) await audit({ actor, action: "faq.update", entity: "Faq", entityId: result.id });
    } else {
      result = await createFaq({ category: { connect: { id: data.categoryId } }, question: data.question, answer: data.answer, sortOrder: data.sortOrder, isPublished: data.isPublished });
      if (actor) await audit({ actor, action: "faq.create", entity: "Faq", entityId: result.id });
    }
    invalidate(...FAQ_TAGS);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deleteFaqAction(id: string): Promise<ActionResult> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("faq.write");
    actor = { id: user.id, email: user.email };
    await deleteFaq(id);
    if (actor) await audit({ actor, action: "faq.delete", entity: "Faq", entityId: id });
    invalidate(...FAQ_TAGS);
    return { ok: true, data: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

