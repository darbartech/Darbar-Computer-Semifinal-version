import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "./auth";
import { STUDENT_LOGIN_PATH } from "./constants";
import { getStudentProfileByUserId, type StudentProfileView } from "./dal/students";

/**
 * Student-portal session guard.
 *
 * The portal shares the better-auth session tables with staff, so a valid
 * session is not enough: the account must also have `role === "STUDENT"` and be
 * active. Staff members are redirected out of the student portal and students
 * are kept out of `/techdarbar` by the staff `requirePermission` checks (a STUDENT
 * role appears in no permission). This is defence in depth on top of the
 * cookie-only redirect in `src/proxy.ts` (docs/02 §4).
 */

export type StudentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
};

export async function getStudentSession() {
  const h = await headers();
  return auth.api.getSession({ headers: h });
}

export async function requireStudent(): Promise<StudentUser> {
  const session = await getStudentSession();
  const user = session?.user as StudentUser | undefined;
  if (!user || user.role !== "STUDENT" || !user.isActive) {
    redirect(STUDENT_LOGIN_PATH);
  }
  return user;
}

/** The signed-in student plus their profile row (throws via redirect if absent). */
export async function requireStudentProfile(): Promise<{
  user: StudentUser;
  profile: StudentProfileView;
}> {
  const user = await requireStudent();
  const profile = await getStudentProfileByUserId(user.id);
  if (!profile) redirect(STUDENT_LOGIN_PATH);
  return { user, profile };
}

export type ApprovedStudentGuard =
  | {
      ok: true;
      user: StudentUser;
      profile: StudentProfileView;
    }
  | { ok: false; error: string };

/**
 * Approval gate for student writes. Registration only takes effect once staff
 * approve it; until then every portal mutation (profile, projects, enrollment
 * requests) is refused here, server-side.
 */
export async function requireApprovedStudentProfile(): Promise<ApprovedStudentGuard> {
  const { user, profile } = await requireStudentProfile();
  if (profile.approvalStatus !== "APPROVED") {
    return {
      ok: false,
      error:
        profile.approvalStatus === "REJECTED"
          ? "Your registration was not approved. Please contact the office."
          : "Your registration is awaiting admin approval. Portal features unlock once an admin approves it.",
    };
  }
  return { ok: true, user, profile };
}
