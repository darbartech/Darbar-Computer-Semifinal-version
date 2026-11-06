"use server";
import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { isRedirectError } from "@/server/session";
import { getClientIpHash } from "@/server/services/rate-limit";
import { createSigninGuard, isCredentialRejection } from "@/server/services/signin-guard";
import {
  completeStaffSignIn,
  GENERIC_SIGNIN_ERROR,
  RATE_LIMITED,
} from "@/server/services/staff-signin";
import {
  isWrongTwoFactorCode,
  RATE_LIMITED_2FA,
  twoFactorMessage,
} from "@/server/services/two-factor";
import type { Role } from "@/generated/prisma/client";

/**
 * Shown for every refusal of the first step. Safe because it says nothing about
 * whether an email exists (docs 08 §1); the shared copies live in
 * `services/staff-signin` so the second step cannot drift from the first.
 */
const GENERIC_ERROR = GENERIC_SIGNIN_ERROR;

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export type AuthActionResult = { ok: true } | { ok: false; error: string };

export type SignInResult =
  /** Signed in: the session cookie is on the response. */
  | { ok: true; secondFactor: false }
  /**
   * Password accepted, second factor outstanding. Better Auth deleted the
   * session it had just made and left a short-lived challenge cookie; the code
   * step is the only thing that can turn it into a session.
   */
  | { ok: true; secondFactor: true }
  | { ok: false; error: string };

/**
 * Signs a staff member in.
 *
 * The error message is deliberately generic (docs/08 §1): it must never reveal
 * whether an email exists.
 */
export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<SignInResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const { email, password } = parsed.data;

  // better-auth's HTTP rate limiter is skipped by direct `auth.api` calls, and
  // the HTTP endpoint itself is now allow-listed (docs 01 §S2), so this action is
  // the only way in and carries the throttling.
  const guard = createSigninGuard("signin", email, await getClientIpHash());
  const gate = await guard.checkGate();
  if (gate === "rate-limited") return { ok: false, error: RATE_LIMITED };
  if (gate === "account-blocked") return { ok: false, error: GENERIC_ERROR };

  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });

    // An accepted password on an account with a second factor never reaches the
    // role check below: the plugin answers with a challenge instead of a session
    // (fix guide §4). Charging the guard here would be wrong — the password was
    // right.
    const challenge = result as { twoFactorRedirect?: unknown };
    if (challenge.twoFactorRedirect === true) {
      return { ok: true, secondFactor: true };
    }

    // Read the role from the sign-in response: the new session cookie was only
    // queued by nextCookies(), so getSession() in this same request would still
    // see the old (empty) cookie jar.
    const user = result.user as typeof result.user & {
      role?: Role;
      isActive?: boolean;
    };
    // Student accounts exist in the same user table; staff login must not accept
    // them. Deactivated accounts keep a valid credential row, so check isActive.
    if (!user || !user.role || user.isActive === false) {
      await guard.recordFailure();
      return { ok: false, error: GENERIC_ERROR };
    }

    return await completeStaffSignIn(user, guard);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[signInWithPassword]",
      error instanceof Error ? error.message : "unknown"
    );
    // Only a wrong credential spends the budget (reaudit N13): during an outage the
    // owner must not burn their five attempts on our own failure. A counter or
    // audit write must still never turn a refused password into a 500.
    if (isCredentialRejection(error)) {
      await guard.recordFailure().catch(() => undefined);
    }
    return { ok: false, error: GENERIC_ERROR };
  }
}

const twoFactorSignInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  code: z
    .string()
    /* Backup codes are issued as `xxxxx-xxxxx`, so this accepts both shapes. */
    .trim()
    .min(6, "Enter the code from your authenticator app")
    .max(16, "Enter the code from your authenticator app"),
  method: z.enum(["totp", "backup"]).default("totp"),
});

/**
 * Second step of staff sign-in (fix guide §4): the code or backup code that
 * turns the pending challenge into a session.
 *
 * Throttled by its own `staff-2fa` bucket, separate from wrong passwords, so a
 * mistyped code never spends the owner's five attempts at the door. Better Auth
 * adds two of its own limits on top: five codes per challenge and a
 * fifteen-minute account lock after five consecutive failures.
 */
export async function verifyStaffSignInTwoFactorAction(
  input: unknown
): Promise<AuthActionResult> {
  const parsed = twoFactorSignInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the code from your authenticator app" };
  const { email, code, method } = parsed.data;

  const guard = createSigninGuard("staff-2fa", email, await getClientIpHash());
  const gate = await guard.checkGate();
  // Both messages name the attempts, not the account, so neither is an existence leak.
  if (gate === "rate-limited") return { ok: false, error: RATE_LIMITED_2FA };
  if (gate === "account-blocked") {
    return { ok: false, error: "Too many wrong codes. Sign in again and try once more." };
  }

  try {
    const headersValue = await headers();
    const body = { code };
    const result =
      method === "backup"
        ? await auth.api.verifyBackupCode({ body, headers: headersValue })
        : await auth.api.verifyTOTP({ body, headers: headersValue });

    const user = result.user as typeof result.user & { role?: Role; isActive?: boolean };

    // The challenge cookie, not this form, decides who is signing in. If that
    // turns out to be someone other than the address the form claims, the claim
    // was only a throttle key: refuse rather than label the wrong account.
    if (user.email.toLowerCase() !== email) {
      await auth.api.signOut({ headers: await headers() });
      await guard.recordFailure().catch(() => undefined);
      return { ok: false, error: "That code does not match this account. Sign in again." };
    }

    return await completeStaffSignIn(user, guard);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[verifyStaffSignInTwoFactorAction]",
      error instanceof Error ? error.message : "unknown"
    );
    if (isWrongTwoFactorCode(error)) {
      await guard.recordFailure().catch(() => undefined);
    }
    return { ok: false, error: twoFactorMessage(error) };
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
