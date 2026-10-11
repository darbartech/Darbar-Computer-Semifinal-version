"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { SIGNATORY_TAGS, invalidate } from "@/server/revalidate";
import {
  createSignatory,
  deleteSignatory,
  getSignatoryWriteSnapshot,
  updateSignatory,
} from "@/server/dal/certificates";
import {
  signatoryWriteSchema,
  type SignatoryWriteValues,
} from "@/lib/validators/certificates";

export type SignatoryActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const NO_PERMISSION = "You don't have permission to do that";
const NOT_FOUND = "Signatory not found";

function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message.includes("FORBIDDEN");
}

function invalid(error: z.ZodError): SignatoryActionResult<never> {
  return {
    ok: false,
    error: "Please fix the highlighted fields",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function fail(message: string): SignatoryActionResult<never> {
  return { ok: false, error: message };
}

export async function saveSignatory(
  input: unknown
): Promise<SignatoryActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.signatory.manage");
    actor = { id: user.id, email: user.email };

    const parsed = signatoryWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data: SignatoryWriteValues = parsed.data;

    const before = data.id ? await getSignatoryWriteSnapshot(data.id) : null;
    if (data.id && !before) return fail(NOT_FOUND);

    const writeValues = {
      name: data.name,
      title: data.title,
      designation: data.designation,
      signatureUrl: data.signatureUrl ?? null,
      isActive: data.isActive,
      displayOrder: data.displayOrder,
    };

    const saved = before
      ? await updateSignatory(data.id!, writeValues)
      : await createSignatory(writeValues);

    await audit({
      actor,
      action: before ? "signatory.update" : "signatory.create",
      entity: "CertificateSignatory",
      entityId: saved.id,
      summary: `${before ? "Updated" : "Created"} signatory ${data.name}`,
      meta: {
        isActive: data.isActive,
        displayOrder: data.displayOrder,
        previousActive: before ? before.isActive : null,
      },
    });

    invalidate(...SIGNATORY_TAGS);
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[saveSignatory]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

export async function deleteSignatoryAction(
  input: unknown
): Promise<SignatoryActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.signatory.manage");
    actor = { id: user.id, email: user.email };

    const parsed = z
      .object({ id: z.string().trim().min(1).max(64) })
      .safeParse(input);
    if (!parsed.success) return fail("Invalid request");
    const { id } = parsed.data;

    const before = await getSignatoryWriteSnapshot(id);
    if (!before) return fail(NOT_FOUND);

    await deleteSignatory(id);

    await audit({
      actor,
      action: "signatory.delete",
      entity: "CertificateSignatory",
      entityId: id,
      summary: `Deleted signatory ${before.name}`,
      meta: {
        previousActive: before.isActive,
      },
    });

    invalidate(...SIGNATORY_TAGS);
    return { ok: true, data: { id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[deleteSignatoryAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}
