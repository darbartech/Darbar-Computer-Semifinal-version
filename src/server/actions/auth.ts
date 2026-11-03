"use server";
import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/services/audit";
import { isRedirectError } from "@/server/session";
import { can } from "@/server/permissions";
import { allow, getClientIpHash, hashIp } from "@/server/services/rate-limit";
import type { Role } from "@/generated/prisma/client";

const GENERIC_ERROR = "Email or password is incorrect";

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export type AuthActionResult = { ok: true } | { ok: false; error: string };

/**
 * Signs a staff member in.
 *
 * The error message is deliberately generic (docs/08 §1): it must never reveal
 * whether an email exists.
 */
export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  try {
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const { email, password } = parsed.data;

    // better-auth's HTTP rate limiter is skipped by direct `auth.api` calls, so
    // this action enforces its own per-IP and per-account throttle.
    const ipHash = await getClientIpHash();
    const [ipAllowed, emailAllowed] = await Promise.all([
      allow(`signin:ip:${ipHash}`, { max: 10, windowMinutes: 15 }),
      allow(`signin:email:${hashIp(`signin-email:${email}`)}`, {
        max: 5,
        windowMinutes: 15,
      }),
    ]);
    if (!ipAllowed || !emailAllowed) {
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });

    // Read the role from the sign-in response: the new session cookie was only
    // queued by nextCookies(), so getSession() in this same request would still
    // see the old (empty) cookie jar.
    const user = result.user as typeof result.user & {
      role?: Role;
      isActive?: boolean;
    };
    // Student accounts exist in the same user table; staff login must not
    // accept them (they have no admin permission and would land on FORBIDDEN).
    // Deactivated accounts keep a valid credential row, so check isActive too.
    if (
      !user ||
      !user.role ||
      user.isActive === false ||
      !can(user.role, "dashboard.view")
    ) {
      await auth.api.signOut({ headers: await headers() });
      return { ok: false, error: GENERIC_ERROR };
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

    return { ok: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[signInWithPassword]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Clears the session cookie. */
export async function signOut(): Promise<AuthActionResult> {
  try {
    await auth.api.signOut({ headers: await headers() });
    return { ok: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[signOut]",
      error instanceof Error ? error.message : "unknown"
    );
    // Tell the client to navigate anyway: the cookie may already be gone.
    return { ok: true };
  }
}

/** True when the caller already has an active session. */
export async function hasSession(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() });
  return Boolean(session?.user);
}