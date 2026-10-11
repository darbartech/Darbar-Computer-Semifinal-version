"use server";
import "server-only";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/services/audit";
import { isRedirectError } from "@/server/session";

const GENERIC_ERROR = "Email or password is incorrect";

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
    await auth.api.signInEmail({
      body: { email: input.email, password: input.password },
      headers: await headers(),
    });

    // Record the login for the audit trail and the "last seen" column.
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { lastLoginAt: new Date() },
      });
      await audit({
        actor: { id: session.user.id, email: session.user.email },
        action: "auth.signin",
        entity: "User",
        entityId: session.user.id,
        summary: "Signed in",
      });
    }

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