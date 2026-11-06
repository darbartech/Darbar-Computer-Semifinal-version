import { describe, expect, it } from "vitest";
import { createOTP } from "@better-auth/utils/otp";
import { E2E_TOTP_SECRET, generateTotp } from "../e2e/totp";

/**
 * The e2e suite signs in as a role that demands a second factor, and nobody is
 * holding an authenticator app: `e2e/totp.ts` stands in for one. It is hand
 * written — the project has no TOTP dependency — so the thing worth proving is
 * not RFC 6238 in general but that this function and the library that will check
 * the code agree, down to how the secret is turned into key material.
 *
 * `createOTP` is the same helper Better Auth's two-factor plugin calls in
 * `verifyTOTP` (`src/server/auth.ts` configures it with the defaults below), so
 * matching it here means matching sign-in.
 */

const PERIOD_MS = 30_000;

const library = () => createOTP(E2E_TOTP_SECRET, { digits: 6, period: 30 });

describe("e2e TOTP generator", () => {
  it("produces the library's code for the same time step", async () => {
    const stamps = [
      0,
      PERIOD_MS - 1,
      PERIOD_MS,
      // A recent real instant, so the counter is large and not just small.
      1_762_400_000_000,
      1_762_400_000_000 + 7_000,
    ];

    for (const when of stamps) {
      const counter = Math.floor(when / PERIOD_MS);
      await expect(library().hotp(counter)).resolves.toBe(generateTotp(E2E_TOTP_SECRET, when));
    }
  });

  it("is accepted by the library's own verifier", async () => {
    await expect(library().verify(generateTotp(E2E_TOTP_SECRET))).resolves.toBe(true);
  });

  it("reproduces the RFC 6238 SHA-1 vectors", () => {
    // Appendix B of the RFC, SHA-1 rows, whose key is the twenty ASCII bytes of
    // the string below — the same reading Better Auth applies to its own secrets
    // (it passes the string to WebCrypto as key material and base32-encodes it
    // only inside the `otpauth://` URI). Six digits is the same truncation with a
    // smaller modulus, since 10^6 divides 10^8, so these are the tail of each
    // published eight-digit code.
    const rfcSecret = "12345678901234567890";

    expect(generateTotp(rfcSecret, 59_000)).toBe("287082"); // 94287082
    expect(generateTotp(rfcSecret, 1_111_111_109_000)).toBe("081804"); // 07081804
    expect(generateTotp(rfcSecret, 1_111_111_111_000)).toBe("050471"); // 14050471
    expect(generateTotp(rfcSecret, 1_234_567_890_000)).toBe("005924"); // 89005924
    expect(generateTotp(rfcSecret, 2_000_000_000_000)).toBe("279037"); // 69279037
    expect(generateTotp(rfcSecret, 20_000_000_000_000)).toBe("353130"); // 65353130
  });

  it("always answers with six digits and holds them for one whole step", () => {
    // Aligned to a step boundary, so the three calls below straddle one full
    // period rather than two halves of it.
    const start = Math.floor(1_762_400_000_000 / PERIOD_MS) * PERIOD_MS;
    const first = generateTotp(E2E_TOTP_SECRET, start);
    expect(first).toMatch(/^\d{6}$/);
    expect(generateTotp(E2E_TOTP_SECRET, start + PERIOD_MS - 1)).toBe(first);
    expect(generateTotp(E2E_TOTP_SECRET, start + PERIOD_MS)).not.toBe(first);
  });
});
