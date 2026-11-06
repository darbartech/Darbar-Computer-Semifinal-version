import "server-only";
import { after } from "next/server";
import { prisma } from "@/server/db";
import { audit } from "@/server/services/audit";
import { notifyFailedSigninBurst } from "@/server/services/email";
import { hashIp, isBlocked, recordHit } from "@/server/services/rate-limit";

/**
 * Sign-in throttling that counts only *failed* attempts (docs 01 §S5).
 *
 * The previous behaviour — one shared bucket per account, charged on every
 * request — let an attacker spend a real admin's five attempts from their own IP
 * and leave the owner permanently on "Email or password is incorrect". Charging
 * only failures, and keying the tight budget by *account + IP*, means the attacker
 * and the owner no longer share a counter.
 */

/** Guessing at one account from one place. */
const ACC_IP_LIMIT = { max: 5, windowMinutes: 15 } as const;
/** Spraying many accounts from one place. */
const IP_LIMIT = { max: 20, windowMinutes: 15 } as const;
/** Not a lock: an alarm so the owner learns someone is trying. */
const ACC_ANY_LIMIT = { max: 30, windowMinutes: 60 } as const;

export type SigninGate =
  /** Proceed to the credential check. */
  | "allowed"
  /** This IP is spending failures too fast, whatever the account. */
  | "rate-limited"
  /** This account has had five wrong passwords from this IP. */
  | "account-blocked";

export type SigninGuard = {
  checkGate: () => Promise<SigninGate>;
  /** Wrong credentials: charge every budget and write the audit row. */
  recordFailure: () => Promise<void>;
  /**
   * Correct credentials presented at the wrong portal (a student on the staff
   * login or the other way round). Not guessing, so only the shared IP budget is
   * charged — the person's own account must not be punished for it.
   */
  recordWrongPortal: () => Promise<void>;
};

export type SigninNamespace =
  | "signin"
  | "student-signin"
  /**
   * The second factor, at both ends: enrolling it on the account page and typing
   * a code during sign-in (fix guide §4). Its own namespace keeps a wrong code
   * from spending the account's wrong-password budget, which would lock the owner
   * out of the very page used to fix 2FA.
   */
  | "staff-2fa";

/**
 * Did the person type the wrong password, or did our own stack fail?
 *
 * Better Auth answers a bad credential with an `APIError` carrying 401 and
 * `body.code = "INVALID_EMAIL_OR_PASSWORD"`, message "Invalid email or password".
 * Anything else that reaches a sign-in `catch` — Postgres down, a broken audit
 * write, an unconfigured mailer, Better Auth's own 429 — is our outage, and
 * charging it would spend a real user's five attempts while they watched a spinner
 * (reaudit N13). Nothing an outage throws uses these words, so the message is a safe
 * fallback for the cases where the status is stripped by a wrapper.
 */
const CREDENTIAL_CODES = new Set(["INVALID_EMAIL_OR_PASSWORD", "INVALID_PASSWORD"]);
const CREDENTIAL_MESSAGE = /invalid (email or password|password|username or password)/i;

export function isCredentialRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { message?: unknown; body?: unknown };
  const code = (e.body as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && CREDENTIAL_CODES.has(code)) return true;
  return typeof e.message === "string" && CREDENTIAL_MESSAGE.test(e.message);
}

/** Audit verbs per portal, keeping the existing `auth.*` / `student.*` prefixes. */
const AUDIT_ACTION: Record<SigninNamespace, string> = {
  signin: "auth.signin.failed",
  "student-signin": "student.signin.failed",
  "staff-2fa": "auth.2fa.verificationFailed",
};

const AUDIT_SUMMARY: Record<SigninNamespace, string> = {
  signin: "Failed staff sign-in attempt",
  "student-signin": "Failed student sign-in attempt",
  "staff-2fa": "Failed staff two-factor verification",
};

export function createSigninGuard(
  namespace: SigninNamespace,
  email: string,
  ipHash: string
): SigninGuard {
  const account = hashIp(`${namespace}:email:${email}`);
  const keys = {
    accIp: `${namespace}:acc-ip:${account}:${ipHash}`,
    acc: `${namespace}:acc:${account}`,
    ip: `${namespace}:ip:${ipHash}`,
  };

  return {
    async checkGate() {
      if (await isBlocked(keys.ip, IP_LIMIT.max, IP_LIMIT.windowMinutes)) {
        return "rate-limited";
      }
      if (await isBlocked(keys.accIp, ACC_IP_LIMIT.max, ACC_IP_LIMIT.windowMinutes)) {
        return "account-blocked";
      }
      return "allowed";
    },

    async recordFailure() {
      await Promise.all([
        recordHit(keys.accIp, ACC_IP_LIMIT.windowMinutes),
        recordHit(keys.ip, IP_LIMIT.windowMinutes),
      ]);

      // `=== max + 1` fires once per window instead of on every further attempt.
      const accountHits = await recordHit(keys.acc, ACC_ANY_LIMIT.windowMinutes);
      if (accountHits === ACC_ANY_LIMIT.max + 1) {
        // The typed address is never persisted — for an unknown account it may be
        // someone else's credential pasted into the wrong field. It is only used
        // after the response, to tell a real owner that their account is targeted.
        after(() => notifyBurst(email));
      }

      await audit({
        actor: { id: null, email: "system" },
        action: AUDIT_ACTION[namespace],
        entity: "User",
        summary: AUDIT_SUMMARY[namespace],
        // Hashed identity only: no email and no raw address (docs/08 §1).
        meta: {
          account: account.slice(0, 16),
          ipHash: ipHash.slice(0, 16),
        },
      });
    },

    async recordWrongPortal() {
      await recordHit(keys.ip, IP_LIMIT.windowMinutes);
    },
  };
}

/** Owner (if the account exists) plus every active SUPER_ADMIN (docs 01 §S5). */
async function notifyBurst(email: string): Promise<void> {
  try {
    const owner = await prisma.user.findUnique({
      where: { email },
      select: { email: true },
    });
    if (!owner) return;

    const admins = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { email: true },
    });
    const result = await notifyFailedSigninBurst({
      ownerEmail: owner.email,
      adminEmails: admins.map((admin) => admin.email),
    });
    if (!result.sent) console.error("[notifyBurst] not sent", result.reason);
  } catch (error) {
    console.error("[notifyBurst]", error instanceof Error ? error.message : "unknown");
  }
}
