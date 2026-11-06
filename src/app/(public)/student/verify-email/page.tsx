import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { VerifyEmailActions } from "@/components/forms/VerifyEmailActions";
import { buildMetadata, NOINDEX_METADATA } from "@/lib/seo";
import { getStudentSession } from "@/server/student-session";
import { STUDENT_LOGIN_PATH, STUDENT_PORTAL_PREFIX } from "@/server/constants";

export const metadata: Metadata = buildMetadata({
  title: "Verify your email",
  path: "/student/verify-email",
  description: "Confirm your email address to open your DarbarTech student portal.",
  robots: NOINDEX_METADATA,
});

/**
 * The interstitial docs 01 §S3 puts between sign-up and the portal.
 *
 * It reads the session itself rather than calling `requireStudent()` — that guard
 * is what sends a person here, and going through it again would loop. Anyone who
 * already confirmed is moved straight on, and a link clicked from another browser
 * (no session) falls back to the login page, which is where the cookie belongs.
 */
export default async function StudentVerifyEmailPage() {
  const session = await getStudentSession();
  const user = session?.user as
    | { email: string; role?: string; emailVerified?: boolean }
    | undefined;

  if (!user || user.role !== "STUDENT") redirect(STUDENT_LOGIN_PATH);
  if (user.emailVerified) redirect(`${STUDENT_PORTAL_PREFIX}?verified=1`);

  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-10">
          <Breadcrumbs items={[{ label: "Student" }, { label: "Verify email" }]} />
          <SectionHeading
            as="h1"
            eyebrow="Student Portal"
            title="Confirm your email"
            description="One more step: your portal opens as soon as you click the link we sent."
            className="mt-2"
          />
        </Container>
      </div>

      <section className="py-10 sm:py-14">
        <Container size="xl">
          <div className="mx-auto w-full max-w-xl">
            <Card>
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-start gap-3 mb-4">
                  <span className="mt-0.5 inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <MailCheck className="size-5" />
                  </span>
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold tracking-tight text-neutral-900">
                      Check your inbox
                    </h2>
                    <p className="text-sm text-neutral-600">
                      We sent a confirmation link when you created the account. It works for
                      one hour.
                    </p>
                  </div>
                </div>
                <VerifyEmailActions email={user.email} />
              </CardContent>
            </Card>
          </div>
        </Container>
      </section>
    </>
  );
}
