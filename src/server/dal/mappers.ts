import "server-only";
import type { Course as CourseView } from "@/types/course";
import type { Prisma } from "../../generated/prisma/client";
import {
  LEARNING_MODE_LABELS,
  LEVEL_LABELS,
  TIME_SLOT_LABELS,
} from "../../../prisma/seed-data/catalog-labels";

/**
 * Row shape every course read selects: the course plus the two relations the
 * view needs (category name, cover URL).
 */
export type CourseRow = Prisma.CourseGetPayload<{
  include: { category: true; cover: true };
}>;

export { LEARNING_MODE_LABELS, LEVEL_LABELS, TIME_SLOT_LABELS };

/** Kept until editors replace the stock covers with real institute photos. */
export const PLACEHOLDER_COURSE_IMAGE =
  "/images/seed/pexels-10638075.jpg";

/** `12` → `"12 Weeks"`. Every duration in the static content was "N Weeks". */
export function formatDuration(weeks: number): string {
  return `${weeks} ${weeks === 1 ? "Week" : "Weeks"}`;
}

/** Money is an integer NPR amount (docs/AGENTS: never store floats). */
export function formatFee(amount: number): string {
  return `NPR ${amount.toLocaleString("en-IN")}`;
}

/**
 * DB row → the existing `Course` view type (docs/06 §5).
 *
 * The components (`CourseCard`, `CourseGrid`, JSON-LD, the course detail page)
 * keep working unchanged because the mapper reproduces the labels the static
 * `prisma/seed-data/courses.ts` used to hard-code. `scripts/verify-seed.ts` compares
 * this output field by field against the static content.
 */
export function toCourseView(row: CourseRow): CourseView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category.name,
    tagline: row.tagline,
    level: LEVEL_LABELS[row.level],
    duration: formatDuration(row.durationWeeks),
    learningMode: row.learningModes
      .map((mode) => LEARNING_MODE_LABELS[mode])
      .join(" / "),
    timing: row.timeSlots.map((slot) => TIME_SLOT_LABELS[slot]).join(" / "),
    newBatch: row.batchFrequency ?? "",
    instituteCertificate: row.instituteCertificate,
    industryCertification: row.industryCertifications.join(", ") || undefined,
    internship: row.internship ?? undefined,
    targetStudents: row.targetStudents,
    skillsGained: row.skillsGained,
    softwareTools: row.softwareTools,
    portfolioProjects: row.portfolioProjects,
    careerOpportunities: row.careerOpportunities,
    image: row.cover?.url ?? PLACEHOLDER_COURSE_IMAGE,
    featured: row.isFeatured,
    feeNPR: row.feeNPR,
    feeNote: row.feeNote ?? undefined,
    seats: row.seatsNote ?? undefined,
    seoTitle: row.seoTitle ?? undefined,
    seoDescription: row.seoDescription ?? undefined,
    overview: row.overview ?? undefined,
    learningObjectives: row.learningObjectives.length
      ? row.learningObjectives
      : undefined,
    prerequisites: row.prerequisites ?? undefined,
    cta: row.ctaText ?? undefined,
    shortDescription: row.shortDescription,
  };
}
