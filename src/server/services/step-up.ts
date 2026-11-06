import "server-only";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { audit } from "@/server/services/audit";
import { getClientIpHash } from "@/server/services/rate-limit";
import { createSigninGuard } from "@/server/services/signin-guard";
import {
  isWrongTwoFactorCode,
  RATE_LIMITED_2FA,
  twoFactorMessage,
} from "@/server/services/two-factor";
import { STEP_UP_CODE_MESSAGE, stepUpSchema } from "@/lib/validators/step-up";

/**
 * Step-up authentication (task 2).
 *
 * A staff session is proof that a password and a code were right *once*, when the
 * person sat down at the counter. The actions below undo money or certificates, or
 * take over an account, so they ask for the code again at the moment of the click.
 * A session copied out of a browser is then not enough: the attacker still needs
 * the phone.
 *
 * Better Auth verifies the code (`verifyTOTP` / `verifyBackupCode` read the current
 * session, check the code against that user's own secret and change nothing else).
 * Everything around that — the throttle, the audit entry, the wording — lives here,
 * so every sensitive screen refuses the same way.
 *
 * Nothing in this file logs a code. The typed digits are the thing being guessed;
 * writing them to stdout or to an audit row would hand the trail to whoever reads it.
 */

/** What was being confirmed. Recorded in the audit entry; never free text. */
export const STEP_UP_PURPOSES = [
  "payment.void",
  "invoice.void",
  "certificate.issue",
  "certificate.revoke",
  "certificate.reissue",
  "user.identity",
  "user.create.privileged",
  "user.active",
  "user.password.reset",
  "user.2fa.reset",
  "user.delete",
  "student.export",
  "student.erase",
  "day.reopen",
  "settings.sensitive",
  "2fa.disable",
] as const;

export type StepUpPurpose = (typeof STEP_UP_PURPOSES)[number];

const PURPOSE_SUMMARY: Record<StepUpPurpose, string> = {
  "payment.void": "Second factor confirmed before voiding a receipt",
  "invoice.void": "Second factor confirmed before voiding an invoice",
  "certificate.issue": "Second factor confirmed before issuing a certificate",
  "certificate.revoke": "Second factor confirmed before revoking a certificate",
  "certificate.reissue": "Second factor confirmed before reissuing a certificate",
  "user.identity": "Second factor confirmed before changing a role or email",
  "user.create.privileged": "Second factor confirmed before creating a privileged account",
  "user.active": "Second factor confirmed before changing an account's status",
  "user.password.reset": "Second factor confirmed before sending a staff password-reset link",
  "user.2fa.reset": "Second factor confirmed before resetting another account's two-factor",
  "user.delete": "Second factor confirmed before deleting an account",
  "student.export": "Second factor confirmed before exporting a student's data",
  "student.erase": "Second factor confirmed before erasing a student's identity",
  "day.reopen": "Second factor confirmed before reopening a counted day",
  "settings.sensitive": "Second factor confirmed before changing a money or sign-in setting",
  "2fa.disable": "Second factor confirmed before turning off two-factor",
};

/** Shown when the form was submitted with an empty code box. */
export const STEP_UP_REQUIRED = "Confirm this with your authenticator code.";

/**
 * Shown to an account that can reach the action but has no second factor to prove
 * it. Only reachable if the role gate is ever widened: every role holding one of
 * these permissions is in `TWO_FACTOR_ROLES`, so it cannot get this far unenrolled.
 */
export const STEP_UP_NOT_ENROLLED =
  "This action needs a second factor. Turn on two-factor on your account page first.";

/** The part of the session this check needs. */
export type StepUpSubject = {
  id: string;
  email: string;
  twoFactorEnabled: boolean;
};

export type StepUpCheck = { ok: true } | { ok: false; error: string };

/**
 * Returns `null` when the code proved who the caller is, or the one sentence to
 * answer them with. It does not throw: an action's `catch` answers every thrown
 * error with the generic failure, and a person who mistyped a digit needs to be
 * told to type it again.
 *
 * The two fields are read out of the same payload the action already parsed, rather
 * than being added to every business schema: a void, an issue and a delete keep the
 * shape they are tested with, and forgetting to pass a code can only ever mean a
 * refusal, never a silent `undefined` slipping past a `.optional()`.
 */
export async function requireStepUp(
  user: StepUpSubject,
  purpose: StepUpPurpose,
  input: unknown
): Promise<StepUpCheck> {
  if (!user.twoFactorEnabled) return { ok: false, error: STEP_UP_NOT_ENROLLED };

  const body = (input ?? {}) as Record<string, unknown>;
  const typed = typeof body.stepUpCode === "string" ? body.stepUpCode.trim() : "";
  // An empty box is a different answer from a wrong one: the person has not tried
  // yet, so it is not charged to the throttling budget and does not need a code.
  if (!typed) return { ok: false, error: STEP_UP_REQUIRED };

  const parsed = stepUpSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: (parsed.error.issues[0]?.message ?? STEP_UP_CODE_MESSAGE) };
  }
  const { stepUpCode: code, stepUpMethod: method } = parsed.data;

  // The same budget as a wrong code at the door, so grinding step-up and grinding
  // sign-in are one counter, not two five-try lanes.
  const guard = createSigninGuard("staff-2fa", user.email, await getClientIpHash());
  const gate = await guard.checkGate();
  if (gate !== "allowed") {
    return {
      ok: false,
      error:
        gate === "rate-limited"
          ? RATE_LIMITED_2FA
          : "Too many wrong codes. Please wait a few minutes and try again.",
    };
  }

  const h = await headers();
  try {
    if (method === "backup") {
      await auth.api.verifyBackupCode({ body: { code }, headers: h });
    } else {
      await auth.api.verifyTOTP({ body: { code }, headers: h });
    }
  } catch (error) {
    // Only a refused code spends the budget; an outage must not lock the owner out
    // of the very screen used to fix their second factor (reaudit N13).
    if (isWrongTwoFactorCode(error)) {
      await guard.recordFailure().catch(() => undefined);
    }
    console.error(
      `[requireStepUp:${purpose}]`,
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: twoFactorMessage(error) };
  }

  await audit({
    actor: { id: user.id, email: user.email },
    action: "auth.2fa.stepUp",
    entity: "User",
    entityId: user.id,
    summary: PURPOSE_SUMMARY[purpose],
    // Which factor was used is a fact about the trail; the value itself is not.
    meta: { purpose, method },
  });

  return { ok: true };
}
