import { createHmac } from "node:crypto";

/**
 * The six-digit code for a test authenticator (docs/08 §2, fix guide §4).
 *
 * The e2e accounts that a password alone cannot unlock — the roles in
 * `TWO_FACTOR_REQUIRED_ROLES` — need a real TOTP code at sign-in, and the suite
 * has no authenticator app. `prisma/seed-test.ts` writes the same secret into
 * `TwoFactor.secret`, so this is the other half of that enrollment: it computes
 * what the app's own verifier will accept.
 *
 * Two details make it match Better Auth rather than a textbook RFC 6238:
 *
 *   1. the HMAC key is the secret's UTF-8 bytes, NOT base32-decoded. The plugin
 *      hands the plain string to WebCrypto as key material (and base32-encodes it
 *      only when it builds the `otpauth://` URI for the QR), so an authenticator
 *      scanning the QR and this function agree because the app's QR carried this
 *      string, not because both speak base32.
 *   2. 30-second steps, 6 digits, SHA-1, counter = `floor(Date.now() / 30000)` —
 *      the same defaults the plugin is configured with in `src/server/auth.ts`.
 *
 * Test-only, like every other credential in `e2e/`: a published secret is safe
 * here solely because the seed guard keeps these rows off a real database.
 */

const PERIOD_MS = 30_000;
const DIGITS = 6;

/**
 * The one secret every gated fixture account is enrolled with, the same way a
 * household shares a door code. `prisma/seed-test.ts` reads `E2E_TOTP_SECRET`
 * too, so overriding it in the environment moves both sides at once — the seed
 * and this generator may never disagree, or no fixture can sign in.
 */
export const E2E_TOTP_SECRET =
  process.env.E2E_TOTP_SECRET || "e2e-only-totp-secret-never-use-in-production";

export function generateTotp(secret: string, when: number = Date.now()): string {
  const counter = BigInt(Math.floor(when / PERIOD_MS));
  const buffer = new Uint8Array(8);
  new DataView(buffer.buffer).setBigUint64(0, counter, false);

  const digest = createHmac("sha1", Buffer.from(secret, "utf8")).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const truncated =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(truncated % 10 ** DIGITS).padStart(DIGITS, "0");
}
