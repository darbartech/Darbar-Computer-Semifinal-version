"use server";
import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { EVENT_TAGS, invalidate } from "@/server/revalidate";
import { eventFilterSchema, eventWriteSchema } from "@/lib/validators/events";
import {
  adminListEvents,
  createEvent,
  eventSlugIsTaken,
  getEventWriteSnapshot,
  updateEvent,
} from "@/server/dal/events";

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

export async function listEvents(
  input: unknown
): Promise<ActionResult<Awaited<ReturnType<typeof adminListEvents>>>> {
  try {
    await requirePermission("events.write");
    const parsed = eventFilterSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    return { ok: true, data: await adminListEvents(parsed.data) };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return fail(GENERIC_FAILURE);
  }
}

export async function saveEvent(input: unknown): Promise<ActionResult<{ id: string; slug: string; status: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("events.write");
    actor = { id: user.id, email: user.email };
    const parsed = eventWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    const id = data.id ? data.id : null;
    if (await eventSlugIsTaken(data.slug, id ?? undefined)) {
      return { ok: false, error: "That URL is already in use", fieldErrors: { slug: ["Another event already uses this URL"] } };
    }
    if (id && !(await getEventWriteSnapshot(id))) return fail("That event was not found");
    const base = {
      title: data.title,
      slug: data.slug,
      category: data.category,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      location: data.location,
      shortDescription: data.shortDescription,
      fullDescription: data.fullDescription,
      cover: data.coverId ? { connect: { id: data.coverId } } : { disconnect: true } as const,
      registrationUrl: data.registrationUrl,
      capacity: data.capacity,
      status: data.status,
    };
    let result;
    if (id) {
      const updateValues: Prisma.EventUpdateInput = base;
      result = await updateEvent(id, updateValues);
      if (actor) await audit({ actor, action: "event.update", entity: "Event", entityId: result.id, summary: result.title });
    } else {
      const createValues: Prisma.EventCreateInput = base as Prisma.EventCreateInput;
      result = await createEvent(createValues);
      if (actor) await audit({ actor, action: "event.create", entity: "Event", entityId: result.id, summary: result.title });
    }
    invalidate(...EVENT_TAGS, `event:${result.slug}`);
    return { ok: true, data: { id: result.id, slug: result.slug, status: result.status } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

