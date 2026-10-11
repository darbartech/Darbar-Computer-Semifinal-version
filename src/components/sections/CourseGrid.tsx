"use client";
import * as React from "react";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Reveal } from "@/components/common/Reveal";
import { CourseCard } from "./CourseCard";
import type { Course } from "@/types/course";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

interface CourseGridProps {
  courses: Course[];
  eyebrow?: string;
  title?: string;
  description?: string;
  showViewAllButton?: boolean;
  headingAlign?: "left" | "center";
}

export function CourseGrid({
  courses,
  eyebrow = "Our Courses",
  title = "Professional Courses, Real-World Skills",
  description,
  showViewAllButton = true,
  headingAlign = "center",
}: CourseGridProps) {
  const defaultDesc =
    "Hands-on courses taught by certified trainers with real industry experience. Small batches, lab-heavy, project-based.";
  const isCenteredHeading = headingAlign === "center";

  return (
    <section aria-labelledby="courses-heading" className="section-padding bg-white">
      <Container size="xl">
        {isCenteredHeading ? (
          <div className="flex flex-col items-center gap-5 mb-10 sm:mb-12">
            <SectionHeading
              eyebrow={eyebrow}
              title={title}
              description={description ?? defaultDesc}
              align="center"
            />
            {showViewAllButton && (
              <Link
                href="/courses"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto group/btn")}
              >
                View All Courses
                <ArrowRight className="size-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 mb-10 sm:mb-12">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <SectionHeading
                eyebrow={eyebrow}
                title={title}
                description={description ?? defaultDesc}
                align="left"
                className="mx-0"
              />
              {showViewAllButton && (
                <Link
                  href="/courses"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "w-full sm:w-auto group/btn sm:shrink-0 mx-auto sm:mx-0 mt-2 sm:mt-0"
                  )}
                >
                  View All Courses
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        )}

        {courses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-neutral-200 p-12 text-center">
            <p className="text-neutral-500">No courses match your filters. Try clearing filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course, i) => (
              <Reveal key={course.id} delay={Math.min(i * 80, 400)} y={20}>
                <CourseCard course={course} />
              </Reveal>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
