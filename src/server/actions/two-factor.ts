"use server";
import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import QRCode from "qrcode";
import { auth } from "@/server/auth";
import { audit } from "@/server/services/audit";
import { can } from "@/server/permissions";
import { isRedirectError, requirePermission, requireSessionUser } from "@/server/session";
import { invalidate, USER_TAGS } from "@/server/revalidate";
import { getClientIpHash } from "@/server/services/rate-limit";
import { createSigninGuard } from "@/server/services/signin-guard";
import { requireStepUp } from "@/server/services/step-up";
import {
  GENERIC_2FA_FAILURE,
  isWrongTwoFactorCode,
  RATE_LIMITED_2FA,
  twoFactorErrorCode,
  twoFactorMessage,
} from "@/server/services/two-factor";
import { resetUserTwoFactor } from "@/server/dal/users";

/**
 * Staff two-factor, the Better Auth plugin driven from server actions only
 * (fix guide §4). `/api/auth/two-factor/*` stays behind the allow-list, so this
 * is the only way in, and it is where the throttling and the audit entries live.
 */

export type TwoFactorActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = GENERIC_2FA_FAILURE;
const NOT_STAFF = "Only staff accounts manage two-factor here.";

function invalid(error: z.ZodError): TwoFactorActionResult<never> {
  return {
    ok: false,
    error: "Please fix the highlighted fields",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function fail(message: string): TwoFactorActionResult<never> {
  return { ok: false, error: message };
}

const passwordSchema = z
  .string()
  .min(1, "Enter your password")
  .max(200, "Enter your password");

const setupStartSchema = z.object({ password: passwordSchema });
const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "Enter the 6-digit code from your authenticator app")
    .max(16, "Enter the 6-digit code from your authenticator app"),
});

/** Signed in as a staff account; students have no admin area to protect. */
async function requireStaffAccount() {
  const user = await requireSessionUser();
  if (!can(user.role, "dashboard.view")) throw new Error("NOT_STAFF");
  return user;
}

/**
 * Step one of enrolling: proves the password, creates the (still unverified)
 * authenticator secret and hands back the QR payload plus the backup codes. The
 * second factor only switches on once `finishTwoFactorSetupAction` verifies a code.
 */
export async function startTwoFactorSetupAction(
  input: unknown
): Promise<TwoFactorActionResult<{ qrDataUrl: string; totpURI: string; backupCodes: string[] }>> {
  try {
    await requireStaffAccount();
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message === "NOT_STAFF") return fail(NOT_STAFF);
    console.error("[startTwoFactorSetupAction]", error instanceof Error ? error.message : "unknown");
    return fail(GENERIC_FAILURE);
  }

  try {
    const parsed = setupStartSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const result = await auth.api.enableTwoFactor({
      body: { password: parsed.data.password, method: "totp" },
      headers: await headers(),
    });
    if (result.method !== "totp") return fail(GENERIC_FAILURE);

    // Rendered here, not in the browser: the QR is the secret in another form, so
    // it never needs to reach a client bundle.
    const qrDataUrl = await QRCode.toDataURL(result.totpURI, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    });
    return {
      ok: true,
      data: { qrDataUrl, totpURI: result.totpURI, backupCodes: result.backupCodes },
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[startTwoFactorSetupAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(twoFactorMessage(error));
  }
}

/**
 * Step two: the first code from the app. This is the write that turns
 * `twoFactorEnabled` on, and Better Auth replaces the session cookie while it
 * does, so the enrolment itself is proof of a live second factor.
 */
export async function finishTwoFactorSetupAction(
  input: unknown
): Promise<TwoFactorActionResult<{ name: string }>> {
  let user: Awaited<ReturnType<typeof requireStaffAccount>>;
  try {
    user = await requireStaffAccount();
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message === "NOT_STAFF") return fail(NOT_STAFF);
    console.error("[finishTwoFactorSetupAction]", error instanceof Error ? error.message : "unknown");
    return fail(GENERIC_FAILURE);
  }

  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  // A wrong code during enrolment is charged to the same budget as a wrong code
  // at the door, so one person cannot grind through codes either way.
  const guard = createSigninGuard("staff-2fa", user.email, await getClientIpHash());
  const gate = await guard.checkGate();
  if (gate !== "allowed") {
    return fail(
      gate === "rate-limited"
        ? RATE_LIMITED_2FA
        : "Too many wrong codes. Please wait a few minutes and try again."
    );
  }

  try {
    await auth.api.verifyTOTP({ body: { code: parsed.data.code }, headers: await headers() });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isWrongTwoFactorCode(error)) {
      await guard.recordFailure().catch(() => undefined);
    }
    console.error("[finishTwoFactorSetupAction]", error instanceof Error ? error.message : "unknown");
    return fail(twoFactorMessage(error));
  }

  await audit({
    actor: { id: user.id, email: user.email },
    action: "auth.2fa.enabled",
    entity: "User",
    entityId: user.id,
    // No secret, no codes: an audit row says what happened, never what to reuse.
    summary: "Two-factor authentication enabled",
  });
  invalidate(...USER_TAGS);
  return { ok: true, data: { name: user.name } };
}

/**
 * Turning two-factor off again. Both halves of the login are asked for: the
 * password, which Better Auth proves inside `disableTwoFactor`, and a code that is
 * valid *right now*, which is what stops a stolen cookie plus a stolen hash from
 * quietly disarming the second factor (task 2).
 */
export async function disableTwoFactorAction(
  input: unknown
): Promise<TwoFactorActionResult<{ disabled: true }>> {
  let user: Awaited<ReturnType<typeof requireStaffAccount>>;
  try {
    user = await requireStaffAccount();
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof Error && error.message === "NOT_STAFF") return fail(NOT_STAFF);
    console.error("[disableTwoFactorAction]", error instanceof Error ? error.message : "unknown");
    return fail(GENERIC_FAILURE);
  }

  try {
    const parsed = setupStartSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const stepUp = await requireStepUp(user, "2fa.disable", input);
    if (!stepUp.ok) return fail(stepUp.error);

    await auth.api.disableTwoFactor({
      body: { password: parsed.data.password },
      headers: await headers(),
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[disableTwoFactorAction]", error instanceof Error ? error.message : "unknown");
    const message = twoFactorMessage(error);
    // The card has two boxes now, so a refused password says which one it belongs
    // to instead of landing under whichever the browser last touched.
    return twoFactorErrorCode(error) === "INVALID_PASSWORD"
      ? { ok: false, error: message, fieldErrors: { password: [message] } }
      : fail(message);
  }

  await audit({
    actor: { id: user.id, email: user.email },
    action: "auth.2fa.disabled",
    entity: "User",
    entityId: user.id,
    summary: "Two-factor authentication turned off",
  });
  invalidate(...USER_TAGS);
  return { ok: true, data: { disabled: true } };
}

/**
 * Recovery for one account that cannot produce a code (fix guide §4). Another
 * person's lockout is never self-service, so this is the SUPER_ADMIN action on
 * the staff directory; the last super administrator uses the documented
 * database procedure instead.
 *
 * Task 2: it clears the code that already refuses a thief, so it is exactly the
 * move an attacker with an admin session would make — hence a fresh second factor
 * from the person doing the resetting, on top of `users.write`.
 */
export async function resetUserTwoFactorAction(
  input: unknown
): Promise<TwoFactorActionResult<{ id: string; sessionsRevoked: number }>> {
  let actor: { id: string; email: string; name: string; twoFactorEnabled: boolean };
  try {
    actor = await requirePermission("users.write");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return fail("You don't have permission to do that");
  }

  try {
    const parsed = z.object({ id: z.string().cuid() }).safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    if (parsed.data.id === actor.id) {
      return fail("Use your own account page to manage your two-factor.");
    }

    const stepUp = await requireStepUp(actor, "user.2fa.reset", input);
    if (!stepUp.ok) return fail(stepUp.error);

    const result = await resetUserTwoFactor(parsed.data.id);
    await audit({
      actor: { id: actor.id, email: actor.email },
      action: "user.resetTwoFactor",
      entity: "User",
      entityId: parsed.data.id,
      summary: "Two-factor reset for a staff account",
      meta: {
        secretsCleared: result.secretsCleared,
        sessionsRevoked: result.sessionsRevoked,
      },
    });
    invalidate(...USER_TAGS);
    return { ok: true, data: { id: parsed.data.id, sessionsRevoked: result.sessionsRevoked } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[resetUserTwoFactorAction]", error instanceof Error ? error.message : "unknown");
    return fail(GENERIC_FAILURE);
  }
}
