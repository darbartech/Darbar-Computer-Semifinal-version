import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/server/db";
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
  plugins: [nextCookies()],
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