import "server-only";

/**
 * Shared vocabulary for the Better Auth two-factor plugin (fix guide §4).
 *
 * Lives outside the Server Action files so both the account-page enrolment and
 * the staff login step describe a refused code the same way.
 */

const WRONG_CODE_CODES = new Set(["INVALID_CODE", "INVALID_BACKUP_CODE"]);

/** Better Auth puts the machine code on `body.code` of the thrown `APIError`. */
export function twoFactorErrorCode(error: unknown): string | undefined {
  const code = (error as { body?: { code?: unknown } } | undefined)?.body?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Did the person type a wrong code, or did our own stack fail?
 *
 * Only a wrong code spends the throttling budget: an outage must not lock a real
 * owner out of their second factor (same rule as the password check, reaudit N13).
 */
export function isWrongTwoFactorCode(error: unknown): boolean {
  const code = twoFactorErrorCode(error);
  if (code && WRONG_CODE_CODES.has(code)) return true;
  // A wrapper can strip the body; the messages below only come from the plugin.
  const message = error instanceof Error ? error.message : "";
  return /^(Invalid code|Invalid backup code)$/i.test(message);
}

/**
 * Human-facing lines. Codes a person can act on are named; anything else is our
 * outage and gets the generic answer, so a plugin change can never leak internals.
 */
const MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: "Your password does not match. Please try again.",
  INVALID_CODE: "That code is not valid right now. Codes expire after 30 seconds.",
  INVALID_BACKUP_CODE: "That backup code has already been used or is not valid.",
  TOTP_ALREADY_ENABLED:
    "An authenticator is already enrolled. Remove it first to set up a new one.",
  TOTP_NOT_ENABLED: "No authenticator is enrolled yet. Start the setup first.",
  BACKUP_CODES_NOT_ENABLED:
    "No backup codes are enrolled for this account. Use the code from your app.",
  TWO_FACTOR_NOT_ENABLED: "Two-factor is not switched on for this account.",
  INVALID_TWO_FACTOR_COOKIE: "That sign-in has expired. Please sign in again.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
    "Too many wrong codes. Please sign in again and try once more.",
  ACCOUNT_TEMPORARILY_LOCKED:
    "This account is temporarily locked after repeated wrong codes. Try again in 15 minutes.",
  UNAUTHORIZED: "Please sign in again before changing this.",
};

export const GENERIC_2FA_FAILURE = "Something went wrong. Please try again.";
export const RATE_LIMITED_2FA =
  "Too many attempts. Please wait a few minutes and try again.";

export function twoFactorMessage(error: unknown): string {
  const code = twoFactorErrorCode(error);
  return (code && MESSAGES[code]) || GENERIC_2FA_FAILURE;
}
