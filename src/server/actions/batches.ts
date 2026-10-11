"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { BATCH_TAGS, invalidate } from "@/server/revalidate";
import { batchWriteSchema } from "@/lib/validators/batch";
import { adminGetBatch, createBatch, deleteBatch, updateBatch } from "@/server/dal/batches";

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

export async function saveBatch(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("batch.write");
    actor = { id: user.id, email: user.email };
    const parsed = batchWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    if (data.seatsTaken > data.seatsTotal) {
      return fail("Seats taken cannot exceed total seats");
    }
    const id = data.id ? data.id : null;
    let result;
    if (id) {
      if (!(await adminGetBatch(id))) return fail("Batch not found");
      result = await updateBatch(id, {
        course: { connect: { id: data.courseId } },
        name: data.name,
        startDate: data.startDate,
        timeSlot: data.timeSlot,
        seatsTotal: data.seatsTotal,
        seatsTaken: data.seatsTaken,
        status: data.status,
      });
      if (actor) await audit({ actor, action: "batch.update", entity: "Batch", entityId: result.id });
    } else {
      result = await createBatch({
        course: { connect: { id: data.courseId } },
        name: data.name,
        startDate: data.startDate,
        timeSlot: data.timeSlot,
        seatsTotal: data.seatsTotal,
        seatsTaken: data.seatsTaken,
        status: data.status,
      });
      if (actor) await audit({ actor, action: "batch.create", entity: "Batch", entityId: result.id });
    }
    invalidate(...BATCH_TAGS);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deleteBatchAction(id: string): Promise<ActionResult> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("batch.write");
    actor = { id: user.id, email: user.email };
    await deleteBatch(id);
    if (actor) await audit({ actor, action: "batch.delete", entity: "Batch", entityId: id });
    invalidate(...BATCH_TAGS);
    return { ok: true, data: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

