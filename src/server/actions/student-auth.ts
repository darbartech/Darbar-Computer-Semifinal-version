"use server";
import "server-only";
import { headers } from "next/headers";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/services/audit";
import { isRedirectError } from "@/server/session";
import { createStudentAccount } from "@/server/dal/students";
import { findUserByEmail } from "@/server/dal/users";
import { studentLoginSchema, studentRegisterSchema } from "@/lib/validators/student";
import { allow, getClientIpHash, hashIp } from "@/server/services/rate-limit";

/**
 * Student-portal authentication.
 *
 * Staff auth is unchanged (`disableSignUp: true` in `src/server/auth.ts` and no
 * public sign-up endpoint); registration here creates the account server-side
 * with the same better-auth credential layout, so sign-in reuses
 * `auth.api.signInEmail`. `requireStudent()` keeps a STUDENT role out of every
 * staff `/techdarbar` permission.
 */

export type StudentAuthResult = { ok: true } | { ok: false; error: string };

const GENERIC_REGISTER_ERROR = "Registration failed. Please try again.";
const GENERIC_LOGIN_ERROR = "Email or password is incorrect";

export async function registerStudent(input: unknown): Promise<StudentAuthResult> {
  try {
    const parsed = studentRegisterSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const first = Object.values(fieldErrors).flat()[0];
      return { ok: false, error: first ?? "Please fix the highlighted fields" };
    }
    const { name, email, phone, password } = parsed.data;

    // Registration is public and credential creation is expensive, so it gets
    // its own per-IP throttle.
    if (!(await allow(`register:ip:${await getClientIpHash()}`, { max: 5, windowMinutes: 60 }))) {
      return { ok: false, error: GENERIC_REGISTER_ERROR };
    }

    if (await findUserByEmail(email)) {
      // Never confirm whether an email is already registered.
      return { ok: false, error: GENERIC_REGISTER_ERROR };
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

export async function loginStudent(input: unknown): Promise<StudentAuthResult> {
  try {
    const parsed = studentLoginSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const first = Object.values(fieldErrors).flat()[0];
      return { ok: false, error: first ?? "Please check your details" };
    }
    const { email, password } = parsed.data;

    const ipHash = await getClientIpHash();
    const [ipAllowed, emailAllowed] = await Promise.all([
      allow(`student-signin:ip:${ipHash}`, { max: 10, windowMinutes: 15 }),
      allow(`student-signin:email:${hashIp(`student-signin-email:${email}`)}`, {
        max: 5,
        windowMinutes: 15,
      }),
    ]);
    if (!ipAllowed || !emailAllowed) {
      return { ok: false, error: GENERIC_LOGIN_ERROR };
    }

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

    // A staff member who signs in here would otherwise land in a portal with no
    // data, so they are signed back out. Inactive accounts are rejected the same
    // way — and with the same generic message, because a distinct one would confirm
    // that the credentials just tried belong to a real account.
    if (!signIn?.user || role !== "STUDENT" || account?.isActive === false) {
      await auth.api.signOut({ headers: await headers() });
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
