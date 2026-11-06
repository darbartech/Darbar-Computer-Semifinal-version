import "server-only";
import { TURNSTILE_DEV_BYPASS } from "@/lib/validators/shared";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = {
  success: boolean;
  errors: string[];
};

/**
 * Cloudflare Turnstile verification (docs/02 §5). The caller runs it after the
 * honeypot and its own rate limit, so a flood of junk requests costs no outbound
 * call (docs 01 §S9). `remoteip` is the raw client address, used in memory only
 * by Cloudflare's risk scoring and never stored.
 *
 * When no secret is configured the check is only skipped outside production
 * and only for the explicit bypass token, so a misconfigured production
 * deployment fails closed instead of accepting every submission.
 */
export async function verifyTurnstile(
  token: string,
  remoteip?: string | null
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return {
        success: false,
        errors: ["turnstile-not-configured"],
      };
    }
    return {
      success: token === TURNSTILE_DEV_BYPASS,
      errors: token === TURNSTILE_DEV_BYPASS ? [] : ["turnstile-not-configured"],
    };
  }

  if (!token) return { success: false, errors: ["missing-input-response"] };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteip) body.set("remoteip", remoteip);

    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      cache: "no-store",
    });

    if (!response.ok) {
      return { success: false, errors: [`http-${response.status}`] };
    }

    const data = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    return {
      success: data.success === true,
      errors: Array.isArray(data["error-codes"]) ? data["error-codes"] : [],
    };
  } catch (error) {
    // A network failure must not silently accept the submission.
    console.error(
      "[turnstile] verify request failed",
      error instanceof Error ? error.message : "unknown"
    );
    return { success: false, errors: ["network-error"] };
  }
}

/** Public site key for the browser widget, or `null` when unconfigured. */
export function getTurnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}
