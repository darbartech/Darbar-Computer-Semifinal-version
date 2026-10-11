import { MessageSquareText, Users, FolderKanban, GraduationCap } from "lucide-react";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";

const steps = [
  {
    icon: MessageSquareText,
    title: "1. Talk to a Counselor",
    description:
      "Tell us your goal (a job, a promotion, a business, a hobby) and we'll recommend the right course and batch for your schedule and background.",
  },
  {
    icon: Users,
    title: "2. Join a Small, Hands-On Batch",
    description:
      "Learn by doing in a real computer lab, with a trainer who checks your work and notices when you're stuck — small classes mean you don't get lost.",
  },
  {
    icon: FolderKanban,
    title: "3. Build a Portfolio Project",
    description:
      "Every course ends with something real you can show an employer — a website, a design portfolio, an app, a campaign — not just a certificate.",
  },
  {
    icon: GraduationCap,
    title: "4. Get Career Support",
    description:
      "Resume polishing, interview prep, and access to our employer network for eligible career-track and diploma programs after you graduate.",
  },
];

export type HowItWorksProps = {
  showHeading?: boolean;
};

export function HowItWorks({ showHeading = true }: HowItWorksProps) {
  return (
    <section aria-labelledby="how-heading" className="section-padding bg-white">
      <Container size="xl">
        {showHeading && (
          <SectionHeading
            eyebrow="Simple Process"
            title="Get Started in 4 Easy Steps"
            description="From first inquiry to graduation, our clear enrollment process keeps everything simple and transparent."
          />
        )}

        <div className={showHeading ? "mt-10 sm:mt-14 relative" : "relative"}>
          <div
            className="hidden lg:block absolute left-[12%] right-[12%] top-[52px] h-0.5 bg-gradient-to-r from-primary/20 via-secondary/30 to-primary/20"
            aria-hidden="true"
          />
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 lg:gap-4">
            {steps.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 flex h-[84px] w-[84px] sm:h-[96px] sm:w-[96px] lg:h-[104px] lg:w-[104px] items-center justify-center rounded-2xl bg-white border-4 border-primary/10 shadow-sm group-hover:border-primary/30 transition-colors duration-300">
                    <div className="flex h-[64px] w-[64px] sm:h-[76px] sm:w-[76px] lg:h-[84px] lg:w-[84px] items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/20">
                      <Icon className="size-6 sm:size-7 lg:size-8" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="mt-5 sm:mt-6 text-lg sm:text-xl font-semibold tracking-tight text-neutral-900">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm text-neutral-600 leading-relaxed max-w-xs">
                    {s.description}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </Container>
    </section>
  );
}
