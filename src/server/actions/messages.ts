"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { MESSAGE_TAGS, invalidate } from "@/server/revalidate";
import { messageUpdateSchema } from "@/lib/validators/messages";
import { adminGetMessage, deleteMessage, updateMessage } from "@/server/dal/messages";

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

export async function updateMessageAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("contact.update");
    actor = { id: user.id, email: user.email };
    const parsed = messageUpdateSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    if (!(await adminGetMessage(data.id))) return fail("Message not found");
    const result = await updateMessage(data.id, { status: data.status, handledAt: data.handledAt });
    if (actor) await audit({ actor, action: "contact.update", entity: "ContactMessage", entityId: result.id });
    invalidate(...MESSAGE_TAGS);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deleteMessageAction(id: string): Promise<ActionResult> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("contact.update");
    actor = { id: user.id, email: user.email };
    await deleteMessage(id);
    if (actor) await audit({ actor, action: "contact.delete", entity: "ContactMessage", entityId: id });
    invalidate(...MESSAGE_TAGS);
    return { ok: true, data: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

