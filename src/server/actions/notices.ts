"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { NOTICE_TAGS, invalidate } from "@/server/revalidate";
import { noticeIdSchema, noticeWriteSchema } from "@/lib/validators/notices";
import { getMediaById } from "@/server/dal/media";
import {
  adminGetNotice,
  createNotice,
  deleteNotice,
  updateNotice,
} from "@/server/dal/notices";

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

/** `""` / undefined mean "undated"; anything else must parse as a date. */
function parseDate(value: string | undefined, field: string, errors: Record<string, string[]>) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors[field] = ["Enter a valid date"];
    return null;
  }
  return date;
}

/**
 * Create or update one notice; `id` decides which, like `saveAssignmentAction`.
 * Saving as PUBLISHED is what puts it in front of visitors.
 */
export async function saveNoticeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("notice.write");
    actor = { id: user.id, email: user.email };

    const parsed = noticeWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    const fieldErrors: Record<string, string[]> = {};
    const startsAt = parseDate(data.startsAt, "startsAt", fieldErrors);
    const endsAt = parseDate(data.endsAt, "endsAt", fieldErrors);

    // A stale id (the media row was deleted from the library since the form was
    // opened) would make the write fail with an opaque Prisma error.
    if (data.imageId && !(await getMediaById(data.imageId))) {
      fieldErrors.imageId = ["That image is no longer in the library. Pick it again."];
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, error: "Please fix the highlighted fields", fieldErrors };
    }

    const fields = {
      type: data.type,
      title: data.title,
      body: data.body,
      startsAt,
      endsAt,
      status: data.status,
      imageId: data.imageId,
    };

    const id = data.id && data.id !== "" ? data.id : null;
    if (id) {
      if (!(await adminGetNotice(id))) return fail("Notice not found");
      await updateNotice(id, fields);
      await audit({
        actor,
        action: "notice.update",
        entity: "Notice",
        entityId: id,
        summary: "Updated notice",
        meta: { status: data.status },
      });
      invalidate(...NOTICE_TAGS);
      return { ok: true, data: { id } };
    }

    const created = await createNotice(fields);
    await audit({
      actor,
      action: "notice.create",
      entity: "Notice",
      entityId: created.id,
      summary: "Created notice",
      meta: { status: data.status },
    });
    invalidate(...NOTICE_TAGS);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[saveNoticeAction]", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deleteNoticeAction(id: string): Promise<ActionResult> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("notice.write");
    actor = { id: user.id, email: user.email };

    const parsed = noticeIdSchema.safeParse({ id });
    if (!parsed.success) return fail("Notice not found");

    if (!(await adminGetNotice(parsed.data.id))) return fail("Notice not found");
    await deleteNotice(parsed.data.id);
    await audit({
      actor,
      action: "notice.delete",
      entity: "Notice",
      entityId: parsed.data.id,
      summary: "Deleted notice",
    });
    invalidate(...NOTICE_TAGS);
    return { ok: true, data: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[deleteNoticeAction]", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: GENERIC_FAILURE };
  }
}
