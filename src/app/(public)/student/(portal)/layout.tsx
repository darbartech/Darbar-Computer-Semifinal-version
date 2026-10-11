import type { Metadata } from "next";
import { Container } from "@/components/common/Container";
import { NOINDEX_METADATA } from "@/lib/seo";
import { requireStudentProfile } from "@/server/student-session";
import { LogoutButton } from "@/components/student/LogoutButton";
import { StudentPortalNav } from "@/components/student/StudentPortalNav";

/**
 * Student-portal shell. `requireStudentProfile()` is the real guard (session +
 * role === STUDENT + active + profile exists); the cookie-only redirect in
 * `src/proxy.ts` is a convenience only. noindex here covers every child page
 * (docs/08 §1).
 */
export const metadata: Metadata = {
  robots: NOINDEX_METADATA,
};

export default async function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireStudentProfile();
  const approved = profile.approvalStatus === "APPROVED";

  return (
    <div className="bg-neutral-50/60 min-h-[60vh]">
      <div className="border-b border-neutral-200 bg-white">
        <Container size="xl" className="py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Student Portal
              </p>
              <h1 className="text-xl font-bold tracking-tight text-neutral-900 truncate">
                {profile.name}
              </h1>
              <p className="text-xs text-neutral-500 mt-0.5">Student ID: {profile.studentCode}</p>
            </div>
            <LogoutButton />
          </div>
          <div className="mt-4 -mb-1">
            <StudentPortalNav locked={!approved} />
          </div>
        </Container>
      </div>

      {!approved && (
        <Container size="xl" className="pt-6">
          <div
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {profile.approvalStatus === "REJECTED" ? (
              <>
                <p className="font-semibold">Your registration was not approved.</p>
                {profile.rejectionReason && <p className="mt-1">Reason: {profile.rejectionReason}</p>}
                <p className="mt-1">Please contact the office to discuss next steps.</p>
              </>
            ) : (
              <>
                <p className="font-semibold">Your account is waiting for admin approval.</p>
                <p className="mt-1">
                  Profile, course requests and portfolio features unlock automatically once an
                  admin approves your registration.
                </p>
              </>
            )}
          </div>
        </Container>
      )}
      <Container size="xl" className="py-8">
        {children}
      </Container>
    </div>
  );
}
