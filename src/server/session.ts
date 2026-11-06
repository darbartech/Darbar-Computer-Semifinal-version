import "server-only";
import { auth } from "./auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Role } from "@/generated/prisma/client";
import { TWO_FACTOR_REQUIRED_ROLES } from "@/lib/validators/users";
import { type PermissionAction, can } from "./permissions";

export async function getSession() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  return session;
}

type ForbiddenError = Error & { code?: string };

/**
 * Roles with no money and no certificates to move, which may still enrol a second
 * factor from the account page because a shared login is a shared risk (task 2).
 */
const OPTIONAL_TWO_FACTOR_ROLES: readonly Role[] = ["COUNSELOR", "INSTRUCTOR", "EDITOR"];

/** The one screen a staff account may reach before it has a second factor. */
export const TWO_FACTOR_ACCOUNT_PATH = "/techdarbar/account";

/**
 * Pure so the matrix can be tested without a request: a gated role with no
 * second factor is sent to its own account page until it enrolls one.
 */
export function needsTwoFactorSetup(role: Role, twoFactorEnabled: boolean): boolean {
  return TWO_FACTOR_REQUIRED_ROLES.includes(role) && !twoFactorEnabled;
}

/** Does this role see the two-factor card at all, required or by choice? */
export function offersTwoFactorSetup(role: Role): boolean {
  return TWO_FACTOR_REQUIRED_ROLES.includes(role) || OPTIONAL_TWO_FACTOR_ROLES.includes(role);
}

/** Is the second factor demanded of this role, rather than merely allowed? */
export function requiresTwoFactor(role: Role): boolean {
  return TWO_FACTOR_REQUIRED_ROLES.includes(role);
}

/**
 * Signed in, active, and no word about two factors. Only the account page and
 * the chrome around it may use this: everything that reads or writes data goes
 * through `requireUser`, which is where the second factor is enforced.
 */
export async function requireSessionUser() {
  const s = await getSession();
  if (!s?.user) redirect("/techdarbar/login");
  const user = s.user as unknown as {
    id: string;
    email: string;
    name: string;
    image: string | null;
    role: Role;
    isActive: boolean;
    twoFactorEnabled: boolean;
  };
  if (!user.isActive) redirect("/techdarbar/login");
  return user;
}

/**
 * The guard every data-reading page and action goes through. A money-moving role
 * that has not enrolled an authenticator is sent to its own account page, which
 * is the only screen that uses `requireSessionUser` (fix guide §4).
 */
export async function requireUser() {
  const user = await requireSessionUser();
  if (needsTwoFactorSetup(user.role, user.twoFactorEnabled)) {
    redirect(TWO_FACTOR_ACCOUNT_PATH);
  }
  return user;
}

/**
 * `requireUser` calls `redirect()` when there is no session or the user is
 * deactivated. Next.js signals that with a `digest`, not a message, so a
 * caller that catches errors (a Server Action, a Route Handler) must re-throw
 * it or the redirect never reaches the browser.
 */
export function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null | undefined)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export async function requireRole(allowedRoles: Role[]) {
  const user = await requireUser();
  if (!allowedRoles.includes(user.role)) {
    const error = new Error("FORBIDDEN: insufficient permissions") as ForbiddenError;
    error.code = "FORBIDDEN";
    throw error;
  }
  return user;
}

export async function requirePermission(action: PermissionAction) {
  const user = await requireUser();
  if (!can(user.role, action)) {
    const error = new Error(`FORBIDDEN: missing permission ${action}`) as ForbiddenError;
    error.code = "FORBIDDEN";
    throw error;
  }
  return user;
}
