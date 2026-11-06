"use server";
import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";
import { isRedirectError } from "@/server/session";
import {
  allow,
  allowByIp,
  getClientIp,
  getClientIpHash,
  hashIp,
} from "@/server/services/rate-limit";
import { verifyTurnstile } from "@/server/services/turnstile";
import {
  passwordResetRequestSchema,
  passwordResetSchema,
} from "@/lib/validators/password-reset";

/**
 * Forgot / reset password for both portals (docs 01 §S4).
 *
 * The two rules that shape this file: never reveal whether an address has an
 * account, and never let a brute-force loop discover that through timing,
 * throttling or a differing message. So the request action answers the same way
 * whether the user exists, the link was delivered, or the budget was already
 * spent — and the reset action says only "invalid or expired".
 */

export type PasswordResetResult =
  | { ok: true; message: string; redirectTo?: string }
  | { ok: false; error: string };

const REQUEST_OK =
  "If that email has an account with us, a reset link is on its way. It expires in 30 minutes.";
const RESET_FAILED =
  "That reset link is invalid or has already been used. Please request a new one.";
const TURNSTILE_FAILED = "Anti-spam check failed. Please try again.";
const GENERIC_FAILURE = "Something went wrong. Please try again.";

const RESET_PAGES = {
  student: "/student/reset-password",
  staff: "/techdarbar/reset-password",
} as const;

function firstFieldError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please fix the highlighted fields";
}

export async function requestPasswordResetAction(
  input: unknown
): Promise<PasswordResetResult> {
  try {
    const parsed = passwordResetRequestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
    const { email, turnstileToken, portal } = parsed.data;

    // Throttle first (docs 01 §S9): Turnstile costs an outbound call, so a flood
    // of junk must not pay for it. Being throttled still answers "check your
    // email" — a distinct error here would turn the form into an oracle for
    // "does this address exist, and how fast is it being requested".
    //
    // The address budget is generous and skips entirely for a campus IP (reaudit
    // N2): it is there to cap a script flood, not to stop a queue of students
    // resetting their own passwords from the lab. The per-email budget — three
    // links an hour for one mailbox — is the one that actually limits abuse, and
    // it stays in force whoever is typing.
    const ipHash = await getClientIpHash();
    const [ipAllowed, emailAllowed] = await Promise.all([
      allowByIp(`pwreset:ip:${ipHash}`, { max: 30, windowMinutes: 60 }),
      allow(`pwreset:email:${hashIp(`pwreset:${email}`)}`, {
        max: 3,
        windowMinutes: 60,
      }),
    ]);
    if (!ipAllowed || !emailAllowed) return { ok: true, message: REQUEST_OK };

    if (!(await verifyTurnstile(turnstileToken, await getClientIp())).success) {
      return { ok: false, error: TURNSTILE_FAILED };
    }

    // Better Auth answers "if this email exists in our system…" for an unknown
    // address too, and never throws for one. Swallowing a transport error keeps
    // that property: a failed send is a server-log problem, not a hint.
    await auth.api
      .requestPasswordReset({
        body: { email, redirectTo: RESET_PAGES[portal] },
        headers: await headers(),
      })
      .catch(() => undefined);

    return { ok: true, message: REQUEST_OK };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[requestPasswordResetAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function resetPasswordAction(
  input: unknown
): Promise<PasswordResetResult> {
  try {
    const parsed = passwordResetSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
    const { token, newPassword, portal } = parsed.data;

    // Read (not consume) the verification row to learn whose password this is, so
    // the audit entry can name the account. Better Auth consumes it — single use —
    // when the reset itself runs. `identifier` is indexed, not unique, hence
    // findFirst with the same `reset-password:<token>` key the library writes.
    const verification = await db.verification
      .findFirst({
        where: { identifier: `reset-password:${token}` },
        select: { value: true },
      })
      .catch(() => null);
    const owner = verification?.value
      ? await db.user
          .findUnique({
            where: { id: verification.value },
            select: { id: true, email: true },
          })
          .catch(() => null)
      : null;

    const reset = await auth.api
      .resetPassword({ body: { token, newPassword }, headers: await headers() })
      .catch(() => null);

    if (!reset?.status) return { ok: false, error: RESET_FAILED };

    await audit({
      actor: { id: owner?.id ?? null, email: owner?.email ?? "unknown" },
      action: "auth.password.reset",
      entity: "User",
      entityId: owner?.id ?? null,
      summary: "Password reset through an emailed link",
      meta: { portal },
    });

    return {
      ok: true,
      message: "Password updated. You can sign in now.",
      redirectTo: portal === "staff" ? "/techdarbar/login" : "/student/login",
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[resetPasswordAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: RESET_FAILED };
  }
}
