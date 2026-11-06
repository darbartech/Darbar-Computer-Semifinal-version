"use server";
import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/services/audit";
import { isRedirectError } from "@/server/session";
import { createStudentAccount } from "@/server/dal/students";
import { findUserByEmail } from "@/server/dal/users";
import { studentLoginSchema, studentRegisterSchema } from "@/lib/validators/student";
import {
  allow,
  allowByIp,
  getClientIp,
  getClientIpHash,
  hashIdentity,
} from "@/server/services/rate-limit";
import { sendAccountExistsEmail } from "@/server/services/email";
import { verifyTurnstile } from "@/server/services/turnstile";
import { createSigninGuard, isCredentialRejection } from "@/server/services/signin-guard";
import { STUDENT_VERIFY_EMAIL_PATH } from "@/server/constants";

/**
 * Student-portal authentication.
 *
 * Staff auth is unchanged (`disableSignUp: true` in `src/server/auth.ts` and no
 * public sign-up endpoint); registration here creates the account server-side
 * with the same better-auth credential layout, so sign-in reuses
 * `auth.api.signInEmail`. `requireStudent()` keeps a STUDENT role out of every
 * staff `/techdarbar` permission.
 *
 * A new account is not trusted until its email is confirmed: the row is created
 * with `emailVerified: false`, the verification mail goes out after the response
 * (docs 01 §S3), and the portal gate in `src/server/student-session.ts` sends the
 * signed-in-but-unconfirmed student to `/student/verify-email`.
 */

export type StudentAuthResult =
  | { ok: true }
  | { ok: false; error: string };

const GENERIC_REGISTER_ERROR = "Registration failed. Please try again.";
const GENERIC_LOGIN_ERROR = "Email or password is incorrect";
const RATE_LIMITED_LOGIN = "Too many attempts. Please wait a few minutes and try again.";
/**
 * A signed-up-from-the-lab student must not read this as a rejection (reaudit N2).
 * The counter is per address, and one address is one building, so the message
 * points at the desk that can finish the form instead of an hour that fixes nothing.
 */
const RATE_LIMITED_REGISTER =
  "Too many sign-ups from this connection. If you are at the campus, the front desk can register you — otherwise, please try again in an hour.";
const VERIFICATION_FAILED = "Please complete the anti-spam check and try again.";

/** Where the verification link lands: the portal, with a "verified" flag. */
const VERIFY_CALLBACK = `${STUDENT_VERIFY_EMAIL_PATH}?verified=1`;

/**
 * The verification mail is sent through Better Auth so the token stays the
 * library's own signed JWT, which `/api/auth/verify-email` then consumes.
 */
async function sendVerificationLink(email: string) {
  await auth.api
    .sendVerificationEmail({ body: { email, callbackURL: VERIFY_CALLBACK } })
    .catch((error: unknown) => {
      // The student can always ask for another link from the verify page, so a
      // failed send is logged, never surfaced (and never named: it may contain
      // the address).
      console.error(
        "[student.verification]",
        error instanceof Error ? error.message : "unknown"
      );
    });
}

/**
 * The "you already have an account" mail, capped per address.
 *
 * A register form that mails any address is an inbox-bombing vector the moment
 * somebody decides to be annoying, so five notices an hour per address is all it
 * will send — and the form has already answered, so a skipped send changes
 * nothing the caller can see. Keyed by a hash: a bucket table is not somewhere to
 * write a student's address (docs/08 §1).
 */
async function notifyAccountExists(email: string): Promise<void> {
  try {
    const canMail = await allow(`register:exists-mail:${hashIdentity(email)}`, {
      max: 5,
      windowMinutes: 60,
    });
    if (!canMail) return;
    const result = await sendAccountExistsEmail({ to: email });
    // The reason is a provider status, never the address.
    if (!result.sent) console.error("[student.accountExists]", result.reason);
  } catch (error) {
    console.error(
      "[student.accountExists]",
      error instanceof Error ? error.message : "unknown"
    );
  }
}

/**
 * Public student sign-up.
 *
 * Guard chain in the order docs 01 §S3/S9 requires: validate → honeypot → rate
 * limit → Turnstile → create. The honeypot returns the same success a real
 * registration does, so a bot cannot tell which field gave it away.
 */
export async function registerStudent(input: unknown): Promise<StudentAuthResult> {
  try {
    const parsed = studentRegisterSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const first = Object.values(fieldErrors).flat()[0];
      return { ok: false, error: first ?? "Please fix the highlighted fields" };
    }
    const { name, email, phone, password, website, turnstileToken } = parsed.data;

    if (website) return { ok: true };

    // Registration is public and credential creation is expensive, so it gets its
    // own throttle. It is keyed by address only to bound a script flood; the real
    // gates are the honeypot and Turnstile. The budget is wide because an
    // institute registers a class from one NAT at a time (reaudit N2), and a
    // campus address listed in RATE_LIMIT_TRUSTED_IPS skips the counter outright.
    const ipHash = await getClientIpHash();
    if (!(await allowByIp(`register:ip:${ipHash}`, { max: 40, windowMinutes: 60 }))) {
      return { ok: false, error: RATE_LIMITED_REGISTER };
    }

    const turnstile = await verifyTurnstile(turnstileToken, await getClientIp());
    if (!turnstile.success) {
      console.error("[registerStudent] turnstile rejected", turnstile.errors.join(","));
      return { ok: false, error: VERIFICATION_FAILED };
    }

    if (await findUserByEmail(email)) {
      // Answered exactly like a real registration (fix guide §10). "Registration
      // failed" told an attacker which addresses are taken *and* was cheaper than
      // hashing a password, so the timing said it too. The person with the
      // address — and only they, since it goes to that mailbox — gets the notice
      // saying what to do next.
      await hashPassword(password); // keep the response time similar
      after(async () => {
        await notifyAccountExists(email);
      });
      return { ok: true };
    }

    const passwordHash = await hashPassword(password);
    const { userId } = await createStudentAccount({
      name,
      email,
      phone: phone || null,
      passwordHash,
    });

    await audit({
      actor: { id: userId, email },
      action: "student.register",
      entity: "StudentProfile",
      entityId: userId,
      summary: "Student registered",
    });

    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });

    // The mail leaves after the response, so a slow or failing provider cannot
    // delay or fail the sign-up (docs/04 §2.3 pattern).
    after(async () => {
      await sendVerificationLink(email);
    });

    return { ok: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[registerStudent]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_REGISTER_ERROR };
  }
}

/**
 * "Resend the verification email" (docs 01 §S3). Only ever sends to the address
 * on the caller's own session, and five re-sends an hour against that account, so
 * it cannot be pointed at somebody else's mailbox.
 */
export async function resendVerificationEmailAction(): Promise<
  { ok: true; message: string } | { ok: false; error: string }
> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const user = session?.user as
      | { id: string; email: string; emailVerified?: boolean; role?: string }
      | undefined;
    if (!session || !user || user.role !== "STUDENT") {
      return { ok: false, error: "Please sign in again to request a new link." };
    }
    if (user.emailVerified) {
      return { ok: false, error: "Your email is already verified. Open your portal." };
    }

    // Keyed by account, not address (reaudit N2). The caller is signed in and the
    // link can only ever go to the address on their own session, so the account is
    // both the correct budget and the one a neighbour in the lab cannot spend.
    if (
      !(await allow(`verify:resend:${user.id}`, {
        max: 5,
        windowMinutes: 60,
      }))
    ) {
      return {
        ok: false,
        error:
          "You have asked for links a few times already. Check your spam folder, or ask our staff to confirm your email for you.",
      };
    }

    await sendVerificationLink(user.email);
    await audit({
      actor: { id: user.id, email: user.email },
      action: "student.email.verification_resent",
      entity: "User",
      entityId: user.id,
      summary: "Verification email re-sent",
    });

    return {
      ok: true,
      message: "If that address needs confirming, a new link is on its way.",
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[resendVerificationEmail]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}


export async function loginStudent(input: unknown): Promise<StudentAuthResult> {
  const parsed = studentLoginSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const first = Object.values(fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Please check your details" };
  }
  const { email, password } = parsed.data;

  // Failures only, and the tight budget is keyed by account *and* IP, so another
  // machine cannot lock a student out of their own portal (docs 01 §S5).
  const guard = createSigninGuard("student-signin", email, await getClientIpHash());
  const gate = await guard.checkGate();
  if (gate === "rate-limited") return { ok: false, error: RATE_LIMITED_LOGIN };
  if (gate === "account-blocked") return { ok: false, error: GENERIC_LOGIN_ERROR };

  try {
    const signIn = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    // The cookie signed in above arrives as a *response* header, so a follow-up
    // getSession() on the request headers cannot see it yet. Read the role off
    // the sign-in response instead (`role` is a better-auth additionalField).
    const account = signIn?.user as
      | { role?: string; isActive?: boolean }
      | undefined;
    const role = account?.role;

    if (!signIn?.user || !account) {
      await guard.recordFailure();
      return { ok: false, error: GENERIC_LOGIN_ERROR };
    }

    // A staff member who signs in here would otherwise land in a portal with no
    // data, so they are signed back out. Inactive accounts are rejected the same
    // way — and with the same generic message, because a distinct one would confirm
    // that the credentials just tried belong to a real account.
    if (role !== "STUDENT" || account.isActive === false) {
      await auth.api.signOut({ headers: await headers() });
      await guard.recordWrongPortal();
      return { ok: false, error: GENERIC_LOGIN_ERROR };
    }

    await prisma.user.update({
      where: { id: signIn.user.id },
      data: { lastLoginAt: new Date() },
    });
    await audit({
      actor: { id: signIn.user.id, email: signIn.user.email },
      action: "student.signin",
      entity: "StudentProfile",
      entityId: signIn.user.id,
      summary: "Student signed in",
    });

    return { ok: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[loginStudent]",
      error instanceof Error ? error.message : "unknown"
    );
    // Only a wrong credential spends the budget (reaudit N13). A database or audit
    // hiccup must not lock a student out of their own portal.
    if (isCredentialRejection(error)) {
      await guard.recordFailure().catch(() => undefined);
    }
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
}

export async function logoutStudent(): Promise<StudentAuthResult> {
  try {
    await auth.api.signOut({ headers: await headers() });
    return { ok: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(
      "[logoutStudent]",
      error instanceof Error ? error.message : "unknown"
    );
    // The cookie may already be gone; let the client navigate anyway.
    return { ok: true };
  }
}
