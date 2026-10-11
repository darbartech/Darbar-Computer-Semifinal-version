"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { GALLERY_TAGS, invalidate } from "@/server/revalidate";
import { galleryItemWriteSchema } from "@/lib/validators/gallery";
import { adminGetGalleryItem, createGalleryItem, deleteGalleryItem, updateGalleryItem } from "@/server/dal/gallery";

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

export async function saveGalleryItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("gallery.write");
    actor = { id: user.id, email: user.email };
    const parsed = galleryItemWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    const id = data.id ? data.id : null;
    let result;
    if (id) {
      if (!(await adminGetGalleryItem(id))) return fail("Item not found");
      result = await updateGalleryItem(id, { media: { connect: { id: data.mediaId } }, title: data.title, alt: data.alt, category: data.category, sortOrder: data.sortOrder, isPublished: data.isPublished });
      if (actor) await audit({ actor, action: "gallery.update", entity: "GalleryItem", entityId: result.id });
    } else {
      result = await createGalleryItem({ media: { connect: { id: data.mediaId } }, title: data.title, alt: data.alt, category: data.category, sortOrder: data.sortOrder, isPublished: data.isPublished });
      if (actor) await audit({ actor, action: "gallery.create", entity: "GalleryItem", entityId: result.id });
    }
    invalidate(...GALLERY_TAGS);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deleteGalleryItemAction(id: string): Promise<ActionResult> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("gallery.write");
    actor = { id: user.id, email: user.email };
    await deleteGalleryItem(id);
    if (actor) await audit({ actor, action: "gallery.delete", entity: "GalleryItem", entityId: id });
    invalidate(...GALLERY_TAGS);
    return { ok: true, data: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

