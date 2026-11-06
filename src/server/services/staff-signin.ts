import "server-only";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/services/audit";
import { can } from "@/server/permissions";
import type { Role } from "@/generated/prisma/client";
import type { SigninGuard } from "@/server/services/signin-guard";

/**
 * The bookkeeping that runs once Better Auth accepts a staff credential —
 * shared by the password step and the second-factor step (fix guide §4), so a
 * person who passes 2FA is checked against the same rules as one who never
 * needed it.
 */

export const GENERIC_SIGNIN_ERROR = "Email or password is incorrect";

export const RATE_LIMITED =
  "Too many attempts. Please wait a few minutes and try again.";

/** What Better Auth hands back; the fields we care about are additional ones. */
export type SignInClaim = {
  id: string;
  email: string;
  role?: Role;
  isActive?: boolean;
};

/**
 * Wrong portal, deactivated, or a student account — all answer with the same
 * generic line, so a login attempt can never confirm which accounts exist
 * (docs/08 §1). `secondFactor: false` says the step is over: the caller's own
 * sign-in result type adds the "challenge still owed" variant.
 */
export async function completeStaffSignIn(
  user: SignInClaim,
  guard: SigninGuard
): Promise<{ ok: true; secondFactor: false } | { ok: false; error: string }> {
  if (!user.role || user.isActive === false) {
    await guard.recordFailure();
    return { ok: false, error: GENERIC_SIGNIN_ERROR };
  }

  if (!can(user.role, "dashboard.view")) {
    // Correct credentials at the wrong door: revoke the session before showing
    // anything, and charge only the shared IP budget.
    await auth.api.signOut({ headers: await headers() });
    await guard.recordWrongPortal();
    await audit({
      actor: { id: user.id, email: user.email },
      action: "auth.signin.rejected",
      entity: "User",
      entityId: user.id,
      summary: "Signed in successfully at the wrong portal",
    });
    return { ok: false, error: GENERIC_SIGNIN_ERROR };
  }

  // Record the login for the audit trail and the "last seen" column.
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await audit({
    actor: { id: user.id, email: user.email },
    action: "auth.signin",
    entity: "User",
    entityId: user.id,
    summary: "Signed in",
  });

  return { ok: true, secondFactor: false };
}
