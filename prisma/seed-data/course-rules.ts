/**
 * Course-catalog seed rules (docs/07 §1–2).
 *
 * These transformations are the contract between `src/content/courses.ts` (the
 * static source of truth until cut-over) and the `Course` table.
 *
 * This module is deliberately dependency-free and does not import from
 * `src/server/`: `prisma/seed.ts` and `scripts/verify-seed.ts` both run under
 * plain `tsx`, where `import "server-only"` throws. The labels it needs live in
 * `prisma/seed-data/catalog-labels.ts`, which is imported by both this file and
 * `src/server/dal/mappers.ts`, so there is still exactly one definition.
 */
import {
  ALLOWED_LEARNING_MODES,
  ALLOWED_TIME_SLOTS,
  LEVEL_LABELS,
} from "./catalog-labels";
import type {
  CourseLevel,
  LearningMode,
  TimeSlot,
} from "../../src/generated/prisma/client";
import type { Course } from "../../src/types/course";

export { ALLOWED_LEARNING_MODES, ALLOWED_TIME_SLOTS };

/** `"Business & Accounting"` → `business-accounting` (docs/07 §3). */
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The static label is the round trip of the DB enum, so it maps both ways. */
const LEVEL_MAP: Record<Course["level"], CourseLevel> = Object.fromEntries(
  Object.entries(LEVEL_LABELS).map(([enumValue, label]) => [label, enumValue as CourseLevel])
) as Record<Course["level"], CourseLevel>;

/** `"Physical / Online / Hybrid"` → `["PHYSICAL","ONLINE","HYBRID"]`. */
export function parseEnumList<T extends string>(
  value: string,
  allowed: readonly T[]
): T[] {
  const seen = new Set<T>();
  for (const part of value.split("/")) {
    const cleaned = part.replace(/only/gi, "").trim().toUpperCase();
    if (!cleaned) continue;
    const match = allowed.find((option) => option === cleaned);
    if (!match) {
      throw new Error(`Unknown "${cleaned}" in "${value}" (allowed: ${allowed.join(", ")})`);
    }
    seen.add(match);
  }
  return [...seen];
}

/** `"Google, Meta"` → `["Google","Meta"]`; missing → `[]`. */export function parseCertificationList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** All 37 durations are `"N Weeks"`. */
export function parseDurationWeeks(value: string): number {
  const weeks = Number.parseInt(value, 10);
  if (!Number.isFinite(weeks) || weeks <= 0) {
    throw new Error(`Cannot parse duration "${value}"`);
  }
  return weeks;
}

export type CourseSeedFields = {
  title: string;
  tagline: string;
  shortDescription: string;
  overview: string | null;
  level: CourseLevel;
  durationWeeks: number;
  learningModes: LearningMode[];
  timeSlots: TimeSlot[];
  batchFrequency: string | null;
  targetStudents: string;
  prerequisites: string | null;
  instituteCertificate: string;
  industryCertifications: string[];
  internship: string | null;
  seatsNote: string | null;
  feeNPR: number;
  feeNote: string | null;
  skillsGained: string[];
  softwareTools: string[];
  portfolioProjects: string[];
  careerOpportunities: string[];
  learningObjectives: string[];
  ctaText: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  isFeatured: boolean;
};

/** Maps one static course to its columns (docs/07 §2). The `id` is dropped. */
export function toCourseSeedFields(course: Course): CourseSeedFields {
  return {
    title: course.title,
    tagline: course.tagline,
    shortDescription: course.shortDescription,
    overview: course.overview ?? null,
    level: LEVEL_MAP[course.level],
    durationWeeks: parseDurationWeeks(course.duration),
    learningModes: parseEnumList(course.learningMode, ALLOWED_LEARNING_MODES),
    timeSlots: parseEnumList(course.timing, ALLOWED_TIME_SLOTS),
    batchFrequency: course.newBatch || null,
    targetStudents: course.targetStudents,
    prerequisites: course.prerequisites ?? null,
    instituteCertificate: course.instituteCertificate,
    industryCertifications: parseCertificationList(course.industryCertification),
    internship: course.internship ?? null,
    seatsNote: course.seats ?? null,
    feeNPR: course.feeNPR ?? 0,
    feeNote: course.feeNote ?? null,
    skillsGained: course.skillsGained,
    softwareTools: course.softwareTools,
    portfolioProjects: course.portfolioProjects,
    careerOpportunities: course.careerOpportunities,
    learningObjectives: course.learningObjectives ?? [],
    ctaText: course.cta ?? null,
    seoTitle: course.seoTitle ?? null,
    seoDescription: course.seoDescription ?? null,
    isFeatured: course.featured === true,
  };
}
