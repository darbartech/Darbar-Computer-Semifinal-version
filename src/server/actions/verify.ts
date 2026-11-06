"use server";
import "server-only";
import { z } from "zod";
import { certificateSearchSchema } from "@/lib/validators/certificates";
import {
  CERTIFICATE_NOT_FOUND_MESSAGE,
  tokenFromReference,
} from "@/lib/certificate-reference";
import {
  findPublicCertificateByNumberAndName,
  getPublicCertificateByToken,
} from "@/server/dal/certificates";
import type { PublicVerifyView } from "@/server/types/certificates";
import { allowByIp, getClientIp, getClientIpHash } from "@/server/services/rate-limit";
import { verifyTurnstile } from "@/server/services/turnstile";

/**
 * Public certificate verification (docs 01 §S7, §S12).
 *
 * A read, not a write: there is nothing to permission-check, audit or invalidate, so
 * it follows the public-form guard chain — validate → rate limit → Turnstile → read —
 * and stops there.
 *
 * Two reference shapes, deliberately different:
 *  - a verification token, typed or pasted from the printed `…/verify/<token>` link.
 *    24 random bytes carry their own proof, so no name is asked for and the full name
 *    is displayed.
 *  - a printed certificate number, which is sequential below its random suffix. That
 *    one only unlocks with the recipient's full name as a second factor, and comes
 *    back with the name masked.
 *
 * Every miss — unknown number, right number with the wrong name, a token that is not
 * on any certificate — answers with the same message, so the form cannot be used to
 * find out which half of a guess was right.
 */

/** Twenty lookups an hour per visitor, on top of Turnstile (docs 01 §S7 step 6). */
const VERIFY_RATE_LIMIT = { max: 20, windowMinutes: 60 } as const;

export type CertificateVerifyResult =
  | { ok: true; certificate: PublicVerifyView; byToken: boolean }
  | {
      ok: false;
      reason: "invalid" | "not_found" | "rate_limited" | "turnstile" | "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

function notFound(): CertificateVerifyResult {
  return { ok: false, reason: "not_found", message: CERTIFICATE_NOT_FOUND_MESSAGE };
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

export async function verifyCertificateAction(
  input: unknown
): Promise<CertificateVerifyResult> {
  try {
    const parsed = certificateSearchSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        reason: "invalid",
        message: "Please check the form and try again.",
        fieldErrors: fieldErrors(parsed.error),
      };
    }

    const { code, recipientName, turnstileToken } = parsed.data;

    // Turnstile is the gate that stops one visitor enumerating; this counter only
    // bounds a script that ignores it, so a shared campus address — a lab full of
    // students each checking their own certificate — is exempted (reaudit N2).
    const ipHash = await getClientIpHash();
    if (!(await allowByIp(`verify:${ipHash}`, VERIFY_RATE_LIMIT))) {
      return {
        ok: false,
        reason: "rate_limited",
        message: "Too many checks from this device. Please wait an hour and try again.",
      };
    }

    const turnstile = await verifyTurnstile(turnstileToken, await getClientIp());
    if (!turnstile.success) {
      console.error("[verifyCertificate] turnstile rejected", turnstile.errors.join(","));
      return {
        ok: false,
        reason: "turnstile",
        message: "Please complete the anti-spam check and try again.",
      };
    }

    // `tokenFromReference` is the regex gate required before the cached token read:
    // only a well-formed token reaches `unstable_cache`, so a typed string cannot be
    // used to grow the cache (docs 01 §S12).
    const token = tokenFromReference(code);
    if (token) {
      const certificate = await getPublicCertificateByToken(token);
      return certificate ? { ok: true, certificate, byToken: true } : notFound();
    }

    const certificate = await findPublicCertificateByNumberAndName(
      code,
      recipientName ?? ""
    );
    return certificate ? { ok: true, certificate, byToken: false } : notFound();
  } catch (error) {
    // The reference can carry a name, so only the failure class is logged (docs/08 §1).
    console.error(
      "[verifyCertificate]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, reason: "error", message: "Something went wrong. Please try again." };
  }
}
