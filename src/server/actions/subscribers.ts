"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { SUBSCRIBER_TAGS, invalidate } from "@/server/revalidate";
import { subscriberUpdateSchema } from "@/lib/validators/subscribers";
import { adminGetSubscriber, deleteSubscriber, updateSubscriber } from "@/server/dal/newsletter";

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

export async function updateSubscriberAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("subscriber.update");
    actor = { id: user.id, email: user.email };
    const parsed = subscriberUpdateSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    if (!(await adminGetSubscriber(data.id))) return fail("Subscriber not found");
    const result = await updateSubscriber(data.id, { status: data.status });
    if (actor) await audit({ actor, action: "subscriber.update", entity: "Subscriber", entityId: result.id });
    invalidate(...SUBSCRIBER_TAGS);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deleteSubscriberAction(id: string): Promise<ActionResult> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("subscriber.update");
    actor = { id: user.id, email: user.email };
    await deleteSubscriber(id);
    if (actor) await audit({ actor, action: "subscriber.delete", entity: "Subscriber", entityId: id });
    invalidate(...SUBSCRIBER_TAGS);
    return { ok: true, data: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

