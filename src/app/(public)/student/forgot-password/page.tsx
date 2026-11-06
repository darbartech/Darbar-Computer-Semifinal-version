import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm";
import { buildMetadata, NOINDEX_METADATA } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Forgot password",
  path: "/student/forgot-password",
  description:
    "Reset your DarbarTech student password by email. The reset link is valid for 30 minutes.",
  robots: NOINDEX_METADATA,
});

export default function StudentForgotPasswordPage() {
  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-10">
          <Breadcrumbs
            items={[
              { label: "Student", href: "/student/login" },
              { label: "Forgot password" },
            ]}
          />
          <SectionHeading
            as="h1"
            eyebrow="Student Portal"
            title="Reset your password"
            description="Tell us the email you registered with and we will send a link to choose a new password."
            className="mt-2"
          />
        </Container>
      </div>

      <section className="py-10 sm:py-14">
        <Container size="xl">
          <div className="mx-auto w-full max-w-xl">
            <Card>
              <CardContent className="p-6 sm:p-8">
                <h2 className="text-lg font-bold tracking-tight text-neutral-900 mb-1">
                  Forgot password
                </h2>
                <p className="text-sm text-neutral-600 mb-5">
                  The link expires in 30 minutes and works once.
                </p>
                <ForgotPasswordForm
                  portal="student"
                  backHref="/student/login"
                  backLabel="Back to sign in"
                />
              </CardContent>
            </Card>
          </div>
        </Container>
      </section>
    </>
  );
}
