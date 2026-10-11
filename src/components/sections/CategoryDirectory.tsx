"use client";
import * as React from "react";
import Link from "next/link";
import {
  Monitor,
  FileText,
  Code2,
  Globe,
  Bot,
  BarChart3,
  Cloud,
  Palette,
  Video,
  Calculator,
  Network,
  Shield,
  Megaphone,
  Briefcase,
  GraduationCap,
  ArrowRight,
} from "lucide-react";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Reveal } from "@/components/common/Reveal";
import { COURSE_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "Basic Computer": Monitor,
  "Office & Productivity": FileText,
  "Programming": Code2,
  "Web Development": Globe,
  "AI & Automation": Bot,
  "Data Science": BarChart3,
  "Cloud & DevOps": Cloud,
  "Graphic Design": Palette,
  "Video Production": Video,
  "Business & Accounting": Calculator,
  "Networking": Network,
  "Cyber Security": Shield,
  "Digital Marketing": Megaphone,
  "Career Programs": Briefcase,
  "Professional Diploma": GraduationCap,
};

const categoryAccentMap: Record<string, string> = {
  "Basic Computer": "from-primary/15 to-primary/5 text-primary",
  "Office & Productivity": "from-accent/15 to-accent/5 text-accent",
  "Programming": "from-secondary/15 to-secondary/5 text-secondary",
  "Web Development": "from-primary/15 to-accent/5 text-primary",
  "AI & Automation": "from-[#7C3AED]/15 to-[#7C3AED]/5 text-[#6D28D9]",
  "Data Science": "from-secondary/15 to-primary/5 text-secondary",
  "Cloud & DevOps": "from-accent/15 to-secondary/5 text-accent",
  "Graphic Design": "from-primary/15 to-secondary/5 text-primary",
  "Video Production": "from-[#DB2777]/15 to-[#DB2777]/5 text-[#BE185D]",
  "Business & Accounting": "from-secondary/15 to-accent/5 text-secondary",
  "Networking": "from-accent/15 to-primary/5 text-accent",
  "Cyber Security": "from-[#DC2626]/15 to-[#DC2626]/5 text-[#B91C1C]",
  "Digital Marketing": "from-primary/15 to-accent/5 text-primary",
  "Career Programs": "from-secondary/15 to-primary/5 text-secondary",
  "Professional Diploma": "from-accent/15 to-primary/5 text-accent",
};

/**
 * Counts come from the caller: a server component reads them with
 * `countPublishedCoursesByCategory()` and passes them down, so this client
 * component never touches the DAL or `src/content/*` (docs/06 §3).
 */
export function CategoryDirectory({
  categoryCounts = {},
}: {
  categoryCounts?: Record<string, number>;
}) {
  return (
    <section aria-labelledby="category-heading" className="section-padding bg-neutral-50">
      <Container size="xl">
        <SectionHeading
          eyebrow="Browse by Category"
          title="Explore All 15 Course Categories"
          description="From beginner fundamentals to advanced career paths — find the perfect track for your goals."
          className="mb-10 sm:mb-12"
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-4">
          {COURSE_CATEGORIES.map((cat, i) => {
            const Icon = categoryIconMap[cat] ?? Monitor;
            const count = categoryCounts[cat] ?? 0;
            const accent = categoryAccentMap[cat] ?? "from-primary/15 to-primary/5 text-primary";

            return (
              <Reveal key={cat} delay={Math.min(i * 60, 480)} y={16}>
                <Link
                  href={`/courses?category=${encodeURIComponent(cat)}`}
                  className={cn(
                    "group relative flex flex-col items-start gap-2.5 sm:gap-3 rounded-2xl border border-neutral-200/80 bg-white p-3 sm:p-5 shadow-sm h-full min-h-[120px] sm:min-h-[140px]",
                    "hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 hover:-translate-y-0.5",
                    "transition-all duration-300 ease-out"
                  )}
                  aria-label={`Browse ${count} ${cat} courses`}
                >
                  <div
                    className={cn(
                      "w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0",
                      "transition-transform duration-300 group-hover:scale-110",
                      accent
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="size-4.5 sm:size-5" />
                  </div>
                  <div className="min-w-0 flex-1 w-full">
                    <h3 className="font-semibold text-sm sm:text-[15px] text-neutral-900 leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-200">
                      {cat}
                    </h3>
                    <p className="mt-1 text-xs text-neutral-500 font-medium">
                      {count} {count === 1 ? "course" : "courses"}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 text-primary text-xs font-medium opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-300">
                    <span>Browse</span>
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
