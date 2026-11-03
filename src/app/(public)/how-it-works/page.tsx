import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { SectionHeading } from "@/components/common/SectionHeading";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { buttonVariants } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo";
import { getSiteSettings } from "@/server/dal/settings";

export async function generateMetadata() {
  return buildMetadata(
    {
      title: "How It Works",
      path: "/how-it-works",
      description:
        "A simple 4-step process to choose the right course, join a batch, build a project, and get career support at DarbarTech.",
    },
    await getSiteSettings()
  );
}

export default function HowItWorksPage() {
  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-12">
          <Breadcrumbs items={[{ label: "How It Works" }]} />
          <SectionHeading
            as="h1"
            eyebrow="Enrollment Process"
            title="How DarbarTech Training Works"
            description="A clear path from your first inquiry to a job-ready portfolio. Simple, practical, and designed for busy schedules."
            className="mt-2"
          />
        </Container>
      </div>

      <HowItWorks showHeading={false} />

      <section className="pb-20">
        <Container size="md">
          <div className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-primary/5 via-white to-secondary/5 p-8 sm:p-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 text-balance">
              Want help picking the right course?
            </h2>
            <p className="mt-3 text-neutral-700 leading-relaxed max-w-lg mx-auto text-pretty">
              Tell us your goal and schedule. We&apos;ll recommend the best path and share batch timing details.
            </p>
            <div className="mt-6">
              <Link href="/admissions/inquire" className={buttonVariants({ size: "lg" })}>
                Book a Consultation
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

