"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { BATCH_TAGS, invalidate } from "@/server/revalidate";
import { batchWriteSchema } from "@/lib/validators/batch";
import type { Prisma } from "../../generated/prisma/client";
import {
  adminGetBatch,
  createBatch,
  deleteBatch,
  isActiveInstructor,
  updateBatch,
} from "@/server/dal/batches";

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
    const id = data.id ? data.id : null;

    // Teacher of record (fix guide §5): this column is what scopes an
    // INSTRUCTOR's reads, so it is validated against the user table instead of
    // trusting the dropdown. An empty choice unassigns the batch.
    const instructorId = data.instructorId?.trim() || null;
    if (instructorId && !(await isActiveInstructor(instructorId))) {
      return fail("Choose an active instructor, or leave the teacher unset.");
    }
    const instructor: Prisma.BatchUpdateInput["instructor"] = instructorId
      ? { connect: { id: instructorId } }
      : { disconnect: true };

    let result;
    if (id) {
      const existing = await adminGetBatch(id);
      if (!existing) return fail("Batch not found");
      // The DB CHECK refuses seatsTotal < seatsTaken; say so in plain words
      // instead of surfacing a constraint error (docs 02 B1).
      if (data.seatsTotal < existing.seatsTaken) {
        return fail(
          `${existing.seatsTaken} student${existing.seatsTaken === 1 ? "" : "s"} already hold seats here. Move or drop them before lowering the seats.`
        );
      }
      result = await updateBatch(id, {
        course: { connect: { id: data.courseId } },
        name: data.name,
        startDate: data.startDate,
        timeSlot: data.timeSlot,
        seatsTotal: data.seatsTotal,
        status: data.status,
        instructor,
      });
      if (actor) await audit({ actor, action: "batch.update", entity: "Batch", entityId: result.id });
    } else {
      result = await createBatch({
        course: { connect: { id: data.courseId } },
        name: data.name,
        startDate: data.startDate,
        timeSlot: data.timeSlot,
        seatsTotal: data.seatsTotal,
        // seatsTaken has no default here: only enrollment transitions write it.
        status: data.status,
        instructor: instructorId ? { connect: { id: instructorId } } : undefined,
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
    const result = await deleteBatch(id);
    if (result.ok === false) {
      if (result.error === "NOT_FOUND") return fail("Batch not found");
      return fail(
        "Move or drop the students first — a batch that still holds enrollments cannot be deleted. Cancel it instead to keep the history."
      );
    }
    if (actor) await audit({ actor, action: "batch.delete", entity: "Batch", entityId: id });
    invalidate(...BATCH_TAGS);
    return { ok: true, data: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

