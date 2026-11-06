import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm";
import { buildMetadata, NOINDEX_METADATA } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Choose a new password",
  path: "/student/reset-password",
  description: "Set a new DarbarTech student password.",
  robots: NOINDEX_METADATA,
});

export default async function StudentResetPasswordPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // The email link is validated by Better Auth's callback, which redirects here
  // with `?token=`. An absent or invalid token simply fails at the server action,
  // so nothing here needs to trust it.
  const { token, error } = await searchParams;
  const invalidLink = error === "INVALID_TOKEN";

  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-10">
          <Breadcrumbs
            items={[
              { label: "Student", href: "/student/login" },
              { label: "New password" },
            ]}
          />
          <SectionHeading
            as="h1"
            eyebrow="Student Portal"
            title="Choose a new password"
            description="Pick something you have not used on this account before."
            className="mt-2"
          />
        </Container>
      </div>

      <section className="py-10 sm:py-14">
        <Container size="xl">
          <div className="mx-auto w-full max-w-xl">
            <Card>
              <CardContent className="p-6 sm:p-8">
                {invalidLink ? (
                  <div
                    className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    This reset link is invalid or has expired. Please request a new one.
                  </div>
                ) : null}
                <ResetPasswordForm
                  portal="student"
                  token={token ?? ""}
                  loginHref="/student/login"
                  loginLabel="Back to sign in"
                />
              </CardContent>
            </Card>
          </div>
        </Container>
      </section>
    </>
  );
}
