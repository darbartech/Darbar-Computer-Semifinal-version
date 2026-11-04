import "server-only";
import { auth } from "./auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Role } from "@/generated/prisma/client";
import { type PermissionAction, can } from "./permissions";

export async function getSession() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  return session;
}

export async function requireUser() {
  const s = await getSession();
  if (!s?.user) redirect("/techdarbar/login");
  const user = s.user as unknown as {
    id: string;
    email: string;
    name: string;
    image: string | null;
    role: Role;
    isActive: boolean;
  };
  if (!user.isActive) redirect("/techdarbar/login");
  return user;
}

type ForbiddenError = Error & { code?: string };

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
