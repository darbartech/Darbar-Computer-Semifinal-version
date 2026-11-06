import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { prisma } from "@/server/db";
import {
  sendPasswordResetEmail,
  sendStudentVerificationEmail,
} from "@/server/services/email";
import {
  AUTH_COOKIE_PREFIX,
  SESSION_TTL_SECONDS,
} from "@/server/constants";

const configuredBaseURL =
  process.env.AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL;

/**
 * The dev server answers on both `localhost` and its IPv4 literal, but Better
 * Auth compares the request Origin to `baseURL`. Without the twin, signing in
 * from the other host fails as INVALID_ORIGIN. Only applies to loopback URLs,
 * so production domains are unaffected.
 */
function loopbackAliases(url: string | undefined): string[] {
  if (!url) return [];
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      return [];
    }
    const twin = parsed.hostname === "localhost" ? "127.0.0.1" : "localhost";
    return [`${parsed.protocol}//${twin}${parsed.port ? `:${parsed.port}` : ""}`];
  } catch {
    return [];
  }
}

export const auth = betterAuth({
  appName: "DarbarTech Admin",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  // nextCookies() must stay last in the plugin list so it can write cookies
  // from Server Actions.
  //
  // Fix guide §4: staff accounts move money and issue certificates, so they
  // carry a second factor. The endpoints themselves stay behind the `/api/auth`
  // allow-list (404 over HTTP); every call is made through `auth.api.*` from a
  // server action, where the throttling in `signin-guard` applies.
  plugins: [
    twoFactor({
      issuer: "DarbarTech Admin",
      totpOptions: { digits: 6, period: 30 },
      // One challenge allows five codes; this is the account-wide budget across
      // challenges, so a leaked authenticator secret cannot be brute forced.
      accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
    }),
    nextCookies(),
  ],
  secret: process.env.AUTH_SECRET,
  baseURL: configuredBaseURL,
  trustedOrigins: loopbackAliases(configuredBaseURL),
  basePath: "/api/auth",
  emailAndPassword: {
    enabled: true,
    // docs/02 §4 + docs/08 §1: staff accounts are created only by the seed
    // script or a SUPER_ADMIN. There is no public sign-up endpoint.
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: false,
    // docs 01 §S4: forgot/reset password. Short-lived (30 min) and single-use —
    // Better Auth consumes the verification row when the password is written.
    resetPasswordTokenExpiresIn: 60 * 30,
    // A reset is the standard response to a compromised password, so every other
    // session of that account is signed out with it.
    revokeSessionsOnPasswordReset: true,
    // A failed send is logged, never thrown: the action already answered "if that
    // email exists, a link is on its way" and must not change its mind.
    sendResetPassword: async ({ user, url }) => {
      const result = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        url,
      });
      if (!result.sent) {
        console.error("[auth] password reset email failed", result.reason);
        // No SMTP credentials in development, so the link is printed instead —
        // otherwise the reset flow could not be exercised locally at all.
        if (process.env.NODE_ENV !== "production") {
          console.log(`[auth] local reset link: ${url}`);
        }
      }
    },
  },
  // docs 01 §S3: student sign-ups must confirm their email before the portal
  // opens. The library is NOT asked to block sign-in (`requireEmailVerification`
  // stays false above, so staff are untouched) — `requireStudent()` in
  // `src/server/student-session.ts` is the gate, and only the student flow ever
  // triggers a send here.
  emailVerification: {
    sendOnSignUp: false,
    sendOnSignIn: false,
    expiresIn: 60 * 60, // 1 hour
    sendVerificationEmail: async ({ user, url }) => {
      const result = await sendStudentVerificationEmail({
        to: user.email,
        name: user.name,
        url,
      });
      if (!result.sent) {
        console.error("[auth] verification email failed", result.reason);
        // Without SMTP credentials the student would have no way to open the
        // portal, so in development the link is printed instead of emailed.
        if (process.env.NODE_ENV !== "production") {
          console.log(`[auth] local verification link: ${url}`);
        }
      }
    },
  },
  session: {
    // DB-backed sessions so a deactivated user is rejected on every request
    // (docs/08 §1) and a password change revokes immediately.
    expiresIn: SESSION_TTL_SECONDS,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 24,
    cookieCache: {
      enabled: false,
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
    // docs/08 §1: login throttling. Keyed by IP at the edge of the library.
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 0 },
      "/forget-password": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 10 },
      // Resending a verification link is the cheap way to spam a mailbox, so it
      // gets the same tight budget as the reset request (docs 01 §S3).
      "/send-verification-email": { window: 300, max: 3 },
    },
  },
  user: {
    modelName: "User",
    additionalFields: {
      role: { type: "string", defaultValue: "EDITOR", input: false },
      isActive: { type: "boolean", defaultValue: true, input: false },
      lastLoginAt: { type: "date", required: false, input: false },
    },
  },
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

export type Auth = typeof auth;