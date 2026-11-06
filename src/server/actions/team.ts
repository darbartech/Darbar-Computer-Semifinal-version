"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { TEAM_TAGS, invalidate } from "@/server/revalidate";
import { teamMemberWriteSchema } from "@/lib/validators/team";
import { adminGetTeamMember, createTeamMember, deleteTeamMember, updateTeamMember } from "@/server/dal/team";

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

export async function saveTeamMember(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("team.write");
    actor = { id: user.id, email: user.email };
    const parsed = teamMemberWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    const id = data.id ? data.id : null;
    let result;
    if (id) {
      if (!(await adminGetTeamMember(id))) return fail("Team member not found");
      result = await updateTeamMember(id, {
        name: data.name,
        role: data.role,
        specialty: data.specialty,
        bio: data.bio,
        photo: data.photoId ? { connect: { id: data.photoId } } : { disconnect: true },
        sortOrder: data.sortOrder,
        isPublished: data.isPublished,
      });
      if (actor) await audit({ actor, action: "team.update", entity: "TeamMember", entityId: result.id });
    } else {
      result = await createTeamMember({
        name: data.name,
        role: data.role,
        specialty: data.specialty,
        bio: data.bio,
        photo: data.photoId ? { connect: { id: data.photoId } } : undefined,
        sortOrder: data.sortOrder,
        isPublished: data.isPublished,
      });
      if (actor) await audit({ actor, action: "team.create", entity: "TeamMember", entityId: result.id });
    }
    invalidate(...TEAM_TAGS);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deleteTeamMemberAction(id: string): Promise<ActionResult> {
  let actor: AuditActor | null = null;
  try {
    // A team member row has no archive flag, so this is the irreversible delete —
    // `team.delete` is SUPER_ADMIN-only while editing stays with the content roles.
    const user = await requirePermission("team.delete");
    actor = { id: user.id, email: user.email };
    await deleteTeamMember(id);
    if (actor) await audit({ actor, action: "team.delete", entity: "TeamMember", entityId: id });
    invalidate(...TEAM_TAGS);
    return { ok: true, data: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

