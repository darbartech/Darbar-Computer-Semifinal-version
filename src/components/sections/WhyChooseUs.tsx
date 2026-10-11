import {
  Award,
  Monitor,
  Briefcase,
  Clock,
  Wallet,
  CheckCircle2,
  Users,
  BookOpenCheck,
  GraduationCap,
} from "lucide-react";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { getSiteSettings } from "@/server/dal/settings";

const statsIcons = [Award, Users, BookOpenCheck, GraduationCap];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  award: Award,
  monitor: Monitor,
  briefcase: Briefcase,
  clock: Clock,
  wallet: Wallet,
  checkCircle: CheckCircle2,
  users: Users,
};

export async function WhyChooseUs() {
  const { whyChooseUs, stats, general } = await getSiteSettings();

  return (
    <section aria-labelledby="why-heading" className="section-padding bg-primary/5">
      <Container size="xl">
        <SectionHeading
          eyebrow="Why Choose Us"
          title="A Training Institute Built Around Student Success"
          description={`What makes ${general.name} different: real-world focus, certified trainers, proper labs, and post-course support.`}
        />

        <div className="mt-8 sm:mt-12 grid grid-cols-1 gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {whyChooseUs.map((item) => {
            const Icon = iconMap[item.icon] ?? Award;
            return (
              <div
                key={item.title}
                className="group relative rounded-2xl border border-neutral-200 bg-white p-5 sm:p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5"
              >
                <div
                  className="absolute top-0 left-0 h-1 w-0 rounded-tr-full bg-gradient-to-r from-primary to-secondary transition-all duration-300 group-hover:w-full"
                  aria-hidden="true"
                />
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-primary/10 text-primary mb-3.5 sm:mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  <Icon className="size-5 sm:size-6" aria-hidden="true" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-neutral-900 leading-snug flex items-start gap-2">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 sm:mt-12 grid grid-cols-2 gap-x-4 gap-y-4 sm:gap-x-6 lg:grid-cols-4">
          {stats.map((stat, i) => {
            const Icon = statsIcons[i % statsIcons.length];
            return (
              <div
                key={stat.label}
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 sm:px-5 sm:py-5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg sm:text-xl font-extrabold tracking-tight text-neutral-900 leading-none">
                      {stat.value}
                      {stat.isPlaceholder && (
                        <span className="text-[10px] sm:text-xs align-super text-neutral-400 ml-0.5">
                          *
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] sm:text-xs text-neutral-600 leading-tight line-clamp-2">
                      {stat.label}
                      {stat.isPlaceholder && (
                        <span className="sr-only"> (illustrative figure)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
