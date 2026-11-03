import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { StudentLoginForm } from "@/components/forms/StudentLoginForm";
import { buildMetadata, NOINDEX_METADATA } from "@/lib/seo";

// A student login page has no business in an index (docs/08 §1).
export const metadata = buildMetadata({
  title: "Student Login",
  path: "/student/login",
  description:
    "Student login for DarbarTech. Sign in to continue your learning journey and manage your training details.",
  robots: NOINDEX_METADATA,
});

export default function StudentLoginPage() {
  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-10">
          <Breadcrumbs items={[{ label: "Student" }, { label: "Login" }]} />
          <SectionHeading
            as="h1"
            eyebrow="Student Portal"
            title="Student Login"
            description="Sign in to continue. New here? Create your student account in minutes."
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
                  Welcome back
                </h2>
                <p className="text-sm text-neutral-600 mb-5">
                  Use your email (or phone) and password to sign in.
                </p>
                <StudentLoginForm />
              </CardContent>
            </Card>
          </div>
        </Container>
      </section>
    </>
  );
}

