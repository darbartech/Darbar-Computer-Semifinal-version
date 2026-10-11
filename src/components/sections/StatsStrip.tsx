import { Container } from "@/components/common/Container";
import { getSiteSettings } from "@/server/dal/settings";
import { Award, Users, BookOpenCheck, GraduationCap } from "lucide-react";

const icons = [Award, Users, BookOpenCheck, GraduationCap];

/** Stats come from the `stats` SiteSetting (docs/04 §4.1). */
export async function StatsStrip() {
  const { stats } = await getSiteSettings();

  return (
    <section
      aria-labelledby="stats-heading"
      className="bg-neutral-50 border-b border-neutral-200"
    >
      <Container size="xl">
        <h2 id="stats-heading" className="sr-only">
          Institute at a Glance
        </h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-8 py-5 sm:py-6">
          {stats.map((stat, i) => {
            const Icon = icons[i % icons.length];
            return (
              <div
                key={stat.label}
                className="group flex items-center gap-2.5 sm:gap-3"
              >
                <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-4 sm:size-[18px]" aria-hidden="true" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="text-lg sm:text-xl lg:text-2xl font-extrabold tracking-tight text-neutral-900 leading-none">
                    {stat.value}
                    {stat.isPlaceholder && (
                      <span className="text-[10px] sm:text-xs align-super text-neutral-400 ml-0.5">
                        *
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] sm:text-xs text-neutral-600 leading-tight mt-0.5 truncate">
                    {stat.label}
                    {stat.isPlaceholder && (
                      <span className="sr-only"> (illustrative figure)</span>
                    )}
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
