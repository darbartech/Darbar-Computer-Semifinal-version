import { getStudentProfileByUserId } from "@/server/dal/students";
import { getStudentSession } from "@/server/student-session";
import { EnrollRequestButton } from "./EnrollRequestButton";

/**
 * Enrollment CTA for signed-in students on public course pages. Renders nothing
 * for visitors and staff; a request button for approved students; a hint for
 * accounts still awaiting approval. Reads the session via headers(), so only
 * this subtree becomes dynamic on an otherwise static course page.
 */
export async function CourseEnrollArea({ courseId }: { courseId: string }) {
  const session = await getStudentSession();
  const user = session?.user as { id: string; role?: string } | undefined;
  if (!user || user.role !== "STUDENT") return null;

  const profile = await getStudentProfileByUserId(user.id);
  if (!profile) return null;

  if (profile.approvalStatus !== "APPROVED") {
    return (
      <p className="text-xs text-neutral-500">
        Enrollment requests unlock once an admin approves your registration.
      </p>
    );
  }

  return <EnrollRequestButton courseId={courseId} />;
}
