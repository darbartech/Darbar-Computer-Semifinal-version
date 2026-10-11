"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { TEMPLATE_TAGS, invalidate } from "@/server/revalidate";
import {
  createTemplate,
  deleteTemplate,
  getTemplateWriteSnapshot,
  templateNameVersionExists,
  updateTemplate,
} from "@/server/dal/certificates";
import {
  templateWriteSchema,
  type TemplateWriteValues,
} from "@/lib/validators/certificates";

export type TemplateActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const NO_PERMISSION = "You don't have permission to do that";
const NOT_FOUND = "Template not found";

function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message.includes("FORBIDDEN");
}

function invalid(error: z.ZodError): TemplateActionResult<never> {
  return {
    ok: false,
    error: "Please fix the highlighted fields",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function fail(message: string): TemplateActionResult<never> {
  return { ok: false, error: message };
}

export async function saveTemplate(
  input: unknown
): Promise<TemplateActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.template.manage");
    actor = { id: user.id, email: user.email };

    const parsed = templateWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data: TemplateWriteValues = parsed.data;

    const before = data.id ? await getTemplateWriteSnapshot(data.id) : null;
    if (data.id && !before) return fail(NOT_FOUND);

    if (await templateNameVersionExists(data.name, data.version, data.id ?? undefined)) {
      return {
        ok: false,
        error: "A template with this name and version already exists",
        fieldErrors: {
          name: ["This name + version combination is already taken"],
        },
      };
    }

    const writeValues = {
      name: data.name,
      version: data.version,
      layoutConfig: (data.layoutConfig ?? null) as Record<string, unknown> | null,
      isActive: data.isActive,
    };

    const saved = before
      ? await updateTemplate(data.id!, writeValues)
      : await createTemplate(writeValues);

    await audit({
      actor,
      action: before ? "template.update" : "template.create",
      entity: "CertificateTemplate",
      entityId: saved.id,
      summary: `${before ? "Updated" : "Created"} template ${data.name} v${data.version}`,
      meta: {
        isActive: data.isActive,
        previousActive: before ? before.isActive : null,
      },
    });

    invalidate(...TEMPLATE_TAGS);
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[saveTemplate]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

export async function deleteTemplateAction(
  input: unknown
): Promise<TemplateActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.template.manage");
    actor = { id: user.id, email: user.email };

    const parsed = z
      .object({ id: z.string().trim().min(1).max(64) })
      .safeParse(input);
    if (!parsed.success) return fail("Invalid request");
    const { id } = parsed.data;

    const before = await getTemplateWriteSnapshot(id);
    if (!before) return fail(NOT_FOUND);

    await deleteTemplate(id);

    await audit({
      actor,
      action: "template.delete",
      entity: "CertificateTemplate",
      entityId: id,
      summary: `Deleted template ${before.name} v${before.version}`,
      meta: {
        previousActive: before.isActive,
      },
    });

    invalidate(...TEMPLATE_TAGS);
    return { ok: true, data: { id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[deleteTemplateAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}
