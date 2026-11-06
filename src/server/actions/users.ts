"use server";
import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/server/auth";
import { ADMIN_PASSWORD_RESET_PATH } from "@/server/constants";
import {
  isRedirectError,
  requirePermission,
  requiresTwoFactor,
} from "@/server/session";
import { audit } from "@/server/services/audit";
import { requireStepUp } from "@/server/services/step-up";
import { invalidate, USER_TAGS } from "@/server/revalidate";
import {
  adminGetUser,
  createUserWithCredential,
  deleteUserGuarded,
  findUserByEmail,
  LAST_SUPER_ADMIN_MESSAGE,
  revokeUserSessions,
  setUserActiveGuarded,
  updateUserGuarded,
} from "@/server/dal/users";
import {
  userActiveSchema,
  userCreateSchema,
  userIdSchema,
  userUpdateSchema,
} from "@/lib/validators/users";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";

const RESET_THROTTLED =
  "Too many reset links were sent just now. Please wait a minute and try again.";

/**
 * Better Auth answers a throttled endpoint with a 429, and its `auth.api.*`
 * wrapper throws an error carrying that status. Only the status is read — the
 * library's message would tell an operator nothing they could act on.
 */
function isTooManyRequests(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { status?: unknown }).status === 429
  );
}

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

    // Four of the seven roles open a door into the money or the ledger, and the
    // account that walks through it inherits a second factor it does not yet have.
    // Creating one of those is confirmed by the person holding the phone (task 2);
    // an Editor or a Counselor stays a one-click hire.
    if (requiresTwoFactor(data.role)) {
      const stepUp = await requireStepUp(admin, "user.create.privileged", input);
      if (!stepUp.ok) return fail(stepUp.error);
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

    // The two fields that decide what an account can do, rather than what it looks
    // like: a new role inherits permissions, and a new email is where that account's
    // password reset — and its next sign-in — arrives (task 2). A name edit stays a
    // one-click change.
    const identityMoved = data.role !== existing.role || data.email !== existing.email;
    if (identityMoved) {
      const stepUp = await requireStepUp(admin, "user.identity", input);
      if (!stepUp.ok) return { ok: false, error: stepUp.error };
    }

    // The last-super-admin floor is checked against locked rows inside the same
    // transaction as the write (fix guide §11): two demotions submitted together
    // used to read the same count and both pass.
    const written = await updateUserGuarded(data.id, {
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive,
    });
    if (!written.ok) return fail(LAST_SUPER_ADMIN_MESSAGE);

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

    // Both directions (task 2). Switching an account on is the easier half to
    // forget and the one an attacker wants: a deactivated accountant revived from
    // a copied session walks straight back into the fee screen.
    const stepUp = await requireStepUp(admin, "user.active", input);
    if (!stepUp.ok) return fail(stepUp.error);

    // Same transaction, same locked rows as the role edit: deactivating the last
    // super admin is the same lock-out, reached from a different button.
    const written = await setUserActiveGuarded(id, isActive);
    if (!written.ok) return fail(LAST_SUPER_ADMIN_MESSAGE);

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

/**
 * Password reset for a staff account (task 2).
 *
 * The admin no longer types the new password. A credential chosen by one person
 * for another is known to two, passes through a browser form, and gets kept —
 * and the counter keeps it after the accountant who was meant to have it has
 * left. So this now sends the same one-time link the user can request themselves
 * (`auth.api.requestPasswordReset`, 30 minutes, single use) and only they set
 * the password, on `/techdarbar/reset-password`.
 *
 * Their live sessions are dropped as soon as the link is issued, not when it is
 * used: an account whose password is being reset because somebody could not
 * reach it should not stay signed in meanwhile. Better Auth revokes again when
 * the password is finally written (`revokeSessionsOnPasswordReset`).
 */
export async function resetUserPasswordAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = userIdSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { id } = parsed.data;

    const existing = await adminGetUser(id);
    if (!existing) return fail("User not found");

    const stepUp = await requireStepUp(admin, "user.password.reset", input);
    if (!stepUp.ok) return fail(stepUp.error);

    try {
      await auth.api.requestPasswordReset({
        body: { email: existing.email, redirectTo: ADMIN_PASSWORD_RESET_PATH },
        headers: await headers(),
      });
    } catch (error) {
      // Better Auth's own budget for this endpoint is three links per minute per
      // IP (src/server/auth.ts `customRules`). It was written for the public
      // forgot-password form; onboarding a room of staff spends it in four clicks.
      if (isTooManyRequests(error)) return fail(RESET_THROTTLED);
      throw error;
    }

    await revokeUserSessions(id);

    await audit({
      actor: { id: admin.id, email: admin.email },
      action: "user.password_reset",
      entity: "User",
      entityId: id,
      summary: "Password reset link sent",
      // The address the link went to is already on the account row; nothing here
      // is worth duplicating (docs/08 §1).
      meta: { via: "admin" },
    });
    invalidate(...USER_TAGS);
    return { ok: true, data: { id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[resetUserPasswordAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/**
 * Deletes an account. Task 2: the permanent one — invoices and receipts of the
 * person are left alone, their login and sessions are not — so it asks for a fresh
 * code on top of the SUPER_ADMIN permission.
 */
export async function deleteUserAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = userIdSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { id } = parsed.data;

    const existing = await adminGetUser(id);
    if (!existing) return fail("User not found");
    if (id === admin.id) return fail("You cannot delete your own account");

    const stepUp = await requireStepUp(admin, "user.delete", input);
    if (!stepUp.ok) return { ok: false, error: stepUp.error };

    // Deleting an account is the permanent version of demoting it, so it goes
    // through the same locked last-super-admin floor.
    const written = await deleteUserGuarded(id);
    if (!written.ok) return fail(LAST_SUPER_ADMIN_MESSAGE);

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
