"use server";
import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { LEAD_TAGS, invalidate } from "@/server/revalidate";
import {
  leadScopeWhere,
  leadStatusPatch,
  type LeadScope,
} from "@/server/dal/leads";
import {
  addLeadActivitySchema,
  assignLeadSchema,
  bulkLeadActionSchema,
  deleteLeadsSchema,
  setLeadFollowUpSchema,
  updateLeadStatusSchema,
} from "@/lib/validators/lead";

export type LeadActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const NO_PERMISSION = "You don't have permission to do that";
const NOT_VISIBLE = "Lead not found";

function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message.includes("FORBIDDEN");
}

function invalid(error: z.ZodError): LeadActionResult<never> {
  return {
    ok: false,
    error: "Please fix the highlighted fields",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

/**
 * Counselor scoping for a single lead: a counselor may only write to a lead
 * that is theirs or unassigned (docs/05 §4.1). Re-checked server-side because
 * a Server Action is a public POST endpoint.
 */
async function assertWritable(
  id: string,
  scope: LeadScope
): Promise<{ ok: true; lead: { id: string; status: string; assignedToId: string | null } } | { ok: false; error: string }> {
  const lead = await db.lead.findFirst({
    where: { AND: [{ id }, leadScopeWhere(scope)] },
    select: { id: true, status: true, assignedToId: true },
  });
  if (!lead) return { ok: false, error: NOT_VISIBLE };
  return { ok: true, lead };
}

/** Status stepper. LOST requires a reason (enforced by the schema). */
export async function updateLeadStatus(
  input: unknown
): Promise<LeadActionResult<{ id: string; status: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("lead.update");
    actor = { id: user.id, email: user.email };
    const scope: LeadScope = { userId: user.id, role: user.role };

    const parsed = updateLeadStatusSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const accessible = await assertWritable(parsed.data.id, scope);
    if (!accessible.ok) return { ok: false, error: accessible.error };

    const updated = await db.lead.update({
      where: { id: parsed.data.id },
      data: leadStatusPatch(
        parsed.data.status,
        parsed.data.lostReason || null
      ),
      select: { id: true, status: true },
    });

    await db.leadActivity.create({
      data: {
        leadId: updated.id,
        actorId: user.id,
        type: "STATUS_CHANGE",
        body:
          parsed.data.status === "LOST"
            ? `Marked as lost: ${parsed.data.lostReason}`
            : `Status changed from ${accessible.lead.status} to ${updated.status}`,
        meta: { from: accessible.lead.status, to: updated.status },
      },
    });

    await audit({
      actor,
      action: "lead.status",
      entity: "Lead",
      entityId: updated.id,
      summary: `Status ${accessible.lead.status} -> ${updated.status}`,
      meta: { from: accessible.lead.status, to: updated.status },
    });

    invalidate(...LEAD_TAGS);
    return { ok: true, data: { id: updated.id, status: updated.status } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error(
      "[updateLeadStatus]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** Assign or unassign. `assigneeId: null` puts the lead back in the queue. */
export async function assignLead(
  input: unknown
): Promise<LeadActionResult<{ id: string; assigneeId: string | null }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("lead.update");
    actor = { id: user.id, email: user.email };
    const scope: LeadScope = { userId: user.id, role: user.role };

    const parsed = assignLeadSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { id, assigneeId } = parsed.data;

    const accessible = await assertWritable(id, scope);
    if (!accessible.ok) return { ok: false, error: accessible.error };

    let assigneeName: string | null = null;
    if (assigneeId) {
      const assignee = await db.user.findFirst({
        where: { id: assigneeId, isActive: true },
        select: { name: true },
      });
      if (!assignee) return { ok: false, error: "That staff member was not found" };
      assigneeName = assignee.name;
    }

    const updated = await db.lead.update({
      where: { id },
      data: { assignedToId: assigneeId },
      select: { id: true, assignedToId: true },
    });

    await db.leadActivity.create({
      data: {
        leadId: id,
        actorId: user.id,
        type: "ASSIGNMENT",
        body: assigneeName ? `Assigned to ${assigneeName}` : "Unassigned",
        meta: { from: accessible.lead.assignedToId, to: assigneeId },
      },
    });

    await audit({
      actor,
      action: "lead.assign",
      entity: "Lead",
      entityId: id,
      summary: assigneeName ? `Assigned to ${assigneeName}` : "Unassigned",
      meta: { assigneeId },
    });

    invalidate(...LEAD_TAGS);
    return {
      ok: true,
      data: { id: updated.id, assigneeId: updated.assignedToId },
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error("[assignLead]", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** Sets or clears the follow-up date used by the "Follow-up today" view. */
export async function setLeadFollowUp(
  input: unknown
): Promise<LeadActionResult<{ id: string; followUpAt: string | null }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("lead.update");
    actor = { id: user.id, email: user.email };
    const scope: LeadScope = { userId: user.id, role: user.role };

    const parsed = setLeadFollowUpSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { id, followUpAt } = parsed.data;

    const accessible = await assertWritable(id, scope);
    if (!accessible.ok) return { ok: false, error: accessible.error };

    const when = followUpAt ? new Date(followUpAt) : null;
    const updated = await db.lead.update({
      where: { id },
      data: { followUpAt: when },
      select: { id: true, followUpAt: true },
    });

    await db.leadActivity.create({
      data: {
        leadId: id,
        actorId: user.id,
        type: "FOLLOW_UP",
        body: when
          ? `Follow-up set for ${when.toISOString().slice(0, 16).replace("T", " ")}`
          : "Follow-up cleared",
        meta: { followUpAt: when?.toISOString() ?? null },
      },
    });

    await audit({
      actor,
      action: "lead.followup",
      entity: "Lead",
      entityId: id,
      summary: when ? "Follow-up scheduled" : "Follow-up cleared",
      meta: { followUpAt: when?.toISOString() ?? null },
    });

    invalidate(...LEAD_TAGS);
    return {
      ok: true,
      data: {
        id: updated.id,
        followUpAt: updated.followUpAt?.toISOString() ?? null,
      },
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error(
      "[setLeadFollowUp]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** "Add note" box and call log (docs/05 §4.1 timeline). */
export async function addLeadNote(
  input: unknown
): Promise<LeadActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("lead.update");
    actor = { id: user.id, email: user.email };
    const scope: LeadScope = { userId: user.id, role: user.role };

    const parsed = addLeadActivitySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const accessible = await assertWritable(parsed.data.id, scope);
    if (!accessible.ok) return { ok: false, error: accessible.error };

    const activity = await db.leadActivity.create({
      data: {
        leadId: parsed.data.id,
        actorId: user.id,
        type: parsed.data.type,
        body: parsed.data.body,
      },
      select: { id: true },
    });

    await audit({
      actor,
      action: "lead.note",
      entity: "Lead",
      entityId: parsed.data.id,
      summary: parsed.data.type === "CALL" ? "Logged a call" : "Added a note",
    });

    invalidate(...LEAD_TAGS);
    return { ok: true, data: { id: activity.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error("[addLeadNote]", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** Bulk assign / mark spam. Rows outside the caller's scope are skipped. */
export async function runBulkLeadAction(
  input: unknown
): Promise<LeadActionResult<{ updated: number }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("lead.update");
    actor = { id: user.id, email: user.email };
    const scope: LeadScope = { userId: user.id, role: user.role };

    const parsed = bulkLeadActionSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { ids, action, assigneeId } = parsed.data;

    const writable = await db.lead.findMany({
      where: { AND: [{ id: { in: ids } }, leadScopeWhere(scope)] },
      select: { id: true },
    });
    const writableIds = writable.map((row) => row.id);
    if (writableIds.length === 0) return { ok: false, error: NOT_VISIBLE };

    if (action === "assign" && !assigneeId) {
      return {
        ok: false,
        error: "Pick someone to assign these leads to",
        fieldErrors: { assigneeId: ["Required"] },
      };
    }

    if (action === "spam") {
      await db.lead.updateMany({
        where: { id: { in: writableIds } },
        data: { status: "SPAM", lostReason: null, enrolledAt: null },
      });
      await db.leadActivity.createMany({
        data: writableIds.map((id) => ({
          leadId: id,
          actorId: user.id,
          type: "STATUS_CHANGE" as const,
          body: "Marked as spam (bulk action)",
        })),
      });
    } else {
      const nextAssigneeId = action === "unassign" ? null : assigneeId!;
      await db.lead.updateMany({
        where: { id: { in: writableIds } },
        data: { assignedToId: nextAssigneeId },
      });
      await db.leadActivity.createMany({
        data: writableIds.map((id) => ({
          leadId: id,
          actorId: user.id,
          type: "ASSIGNMENT" as const,
          body: nextAssigneeId ? "Assigned (bulk action)" : "Unassigned (bulk action)",
        })),
      });
    }

    await audit({
      actor,
      action: `lead.bulk.${action}`,
      entity: "Lead",
      entityId: null,
      summary: `Bulk ${action} on ${writableIds.length} lead(s)`,
      meta: { count: writableIds.length, action },
    });

    invalidate(...LEAD_TAGS);
    return { ok: true, data: { updated: writableIds.length } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error(
      "[runBulkLeadAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** Hard delete. SUPER_ADMIN only (docs/04 §2.2, `lead.delete`). */
export async function hardDeleteLeads(
  input: unknown
): Promise<LeadActionResult<{ deleted: number }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("lead.delete");
    actor = { id: user.id, email: user.email };

    const parsed = deleteLeadsSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const ids = parsed.data.ids;

    const result = await db.lead.deleteMany({ where: { id: { in: ids } } });

    await audit({
      actor,
      action: "lead.delete",
      entity: "Lead",
      entityId: null,
      summary: `Hard deleted ${result.count} lead(s)`,
      meta: { count: result.count, ids },
    });

    invalidate(...LEAD_TAGS);
    return { ok: true, data: { deleted: result.count } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error(
      "[hardDeleteLeads]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}
