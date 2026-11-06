/**
 * Enum → label maps for the course catalog (docs/07 §2).
 *
 * This module is the single definition of how the DB enums are rendered, and it
 * is imported by both sides of the seed boundary:
 *
 * - `src/server/dal/mappers.ts` — `toCourseView()` for the public pages.
 * - `prisma/seed-data/course-rules.ts` — the reverse direction, when the static
 *   `prisma/seed-data/courses.ts` is loaded into the database.
 *
 * It must stay free of imports so both a `tsx` seed run and a Next.js build can
 * use it. The label values are the exact strings the static content used, which
 * is what makes the mapper output byte-identical to the old static objects.
 */
import type {
  CourseLevel,
  LearningMode,
  TimeSlot,
} from "../../src/generated/prisma/client";
import type { Course } from "../../src/types/course";

export const LEVEL_LABELS = {
  BEGINNER: "Beginner",
  BEGINNER_TO_INTERMEDIATE: "Beginner to Intermediate",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
} as const satisfies Record<CourseLevel, Course["level"]>;

export const LEARNING_MODE_LABELS = {
  PHYSICAL: "Physical",
  ONLINE: "Online",
  HYBRID: "Hybrid",
} as const satisfies Record<LearningMode, string>;

export const TIME_SLOT_LABELS = {
  MORNING: "Morning",
  DAY: "Day",
  EVENING: "Evening",
  WEEKEND: "Weekend",
} as const satisfies Record<TimeSlot, string>;

/** Values accepted by `parseEnumList()`; mirrors the two maps above. */
export const ALLOWED_LEARNING_MODES = ["PHYSICAL", "ONLINE", "HYBRID"] as const;
export const ALLOWED_TIME_SLOTS = ["MORNING", "DAY", "EVENING", "WEEKEND"] as const;
