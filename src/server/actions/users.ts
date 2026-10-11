"use server";
import "server-only";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit } from "@/server/services/audit";
import { invalidate, USER_TAGS } from "@/server/revalidate";
import {
  adminGetUser,
  countActiveSuperAdmins,
  createUserWithCredential,
  deleteUser,
  findUserByEmail,
  revokeUserSessions,
  setUserActive,
  updateUser,
  upsertCredentialPassword,
} from "@/server/dal/users";
import {
  userActiveSchema,
  userCreateSchema,
  userIdSchema,
  userPasswordSchema,
  userUpdateSchema,
} from "@/lib/validators/users";

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

/**
 * `users.write` is already SUPER_ADMIN-only (docs/08 §1). The extra role check
 * keeps the intent explicit if the matrix is ever widened.
 */
async function requireSuperAdmin() {
  const user = await requirePermission("users.write");
  if (user.role !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN: super administrator required");
  }
  return user;
}

export async function createUserAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = userCreateSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    if (await findUserByEmail(data.email)) {
      return fail("A user with this email already exists");
    }

    const passwordHash = await hashPassword(data.password);
    const created = await createUserWithCredential({
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive,
      passwordHash,
    });

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: "user.create",
      entity: "User",
      entityId: created.id,
      summary: `Created ${data.role} account`,
    });
    invalidate(...USER_TAGS);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function updateUserAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = userUpdateSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    const existing = await adminGetUser(data.id);
    if (!existing) return fail("User not found");

    const isSelf = data.id === admin.id;
    if (isSelf && data.role !== "SUPER_ADMIN") return fail("You cannot change your own role");
    if (isSelf && !data.isActive) return fail("You cannot deactivate your own account");

    if (data.email !== existing.email && (await findUserByEmail(data.email, data.id))) {
      return fail("A user with this email already exists");
    }

    const losesActiveSuper =
      existing.role === "SUPER_ADMIN" &&
      existing.isActive &&
      (data.role !== "SUPER_ADMIN" || !data.isActive);
    if (losesActiveSuper && (await countActiveSuperAdmins()) <= 1) {
      return fail("At least one active super administrator must remain");
    }

    await updateUser(data.id, {
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive,
    });

    if (!data.isActive) await revokeUserSessions(data.id);

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: data.role !== existing.role ? "user.role_update" : "user.update",
      entity: "User",
      entityId: data.id,
      summary: data.role !== existing.role ? `Role changed to ${data.role}` : "Profile updated",
    });
    invalidate(...USER_TAGS);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function setUserActiveAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = userActiveSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { id, isActive } = parsed.data;

    const existing = await adminGetUser(id);
    if (!existing) return fail("User not found");
    if (id === admin.id && !isActive) return fail("You cannot deactivate your own account");

    if (
      !isActive &&
      existing.role === "SUPER_ADMIN" &&
      existing.isActive &&
      (await countActiveSuperAdmins()) <= 1
    ) {
      return fail("At least one active super administrator must remain");
    }

    await setUserActive(id, isActive);
    // Deactivation must take effect on the very next request (docs/08 §1).
    if (!isActive) await revokeUserSessions(id);

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: isActive ? "user.activate" : "user.deactivate",
      entity: "User",
      entityId: id,
      summary: isActive ? "Account activated" : "Account deactivated",
    });
    invalidate(...USER_TAGS);
    return { ok: true, data: { id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function resetUserPasswordAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = userPasswordSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { id, password } = parsed.data;

    if (!(await adminGetUser(id))) return fail("User not found");

    const passwordHash = await hashPassword(password);
    await upsertCredentialPassword(id, passwordHash);
    // Rotating a password logs the account out everywhere.
    await revokeUserSessions(id);

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: "user.password_reset",
      entity: "User",
      entityId: id,
      summary: "Password reset",
    });
    invalidate(...USER_TAGS);
    return { ok: true, data: { id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function deleteUserAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = userIdSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { id } = parsed.data;

    const existing = await adminGetUser(id);
    if (!existing) return fail("User not found");
    if (id === admin.id) return fail("You cannot delete your own account");

    if (
      existing.role === "SUPER_ADMIN" &&
      existing.isActive &&
      (await countActiveSuperAdmins()) <= 1
    ) {
      return fail("At least one active super administrator must remain");
    }

    await deleteUser(id);

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: "user.delete",
      entity: "User",
      entityId: id,
      summary: "Account deleted",
    });
    invalidate(...USER_TAGS);
    return { ok: true, data: { id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}
