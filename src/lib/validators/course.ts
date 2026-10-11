import { z } from "zod";
import {
  ALLOWED_LEARNING_MODES,
  ALLOWED_TIME_SLOTS,
  LEARNING_MODE_LABELS,
  LEVEL_LABELS,
  TIME_SLOT_LABELS,
} from "../../../prisma/seed-data/catalog-labels";
import { cuidLike, pageParamSchema } from "./shared";

/**
 * Course / category form rules (docs/06 §7).
 *
 * Imported by both the admin forms ("use client") and the Server Actions, so it
 * must not import Prisma or `server-only`. The literal arrays below are asserted
 * against the generated Prisma enums in `tests/validators.test.ts` so the two
 * cannot drift apart.
 */

export const COURSE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export const COURSE_LEVELS = [
  "BEGINNER",
  "BEGINNER_TO_INTERMEDIATE",
  "INTERMEDIATE",
  "ADVANCED",
] as const;

export const LEARNING_MODES = ALLOWED_LEARNING_MODES;
export const TIME_SLOTS = ALLOWED_TIME_SLOTS;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

/** Select options for the admin form; labels match the public pages exactly. */
export const LEVEL_OPTIONS = COURSE_LEVELS.map((value) => ({
  value,
  label: LEVEL_LABELS[value],
}));
export const LEARNING_MODE_OPTIONS = LEARNING_MODES.map((value) => ({
  value,
  label: LEARNING_MODE_LABELS[value],
}));
export const TIME_SLOT_OPTIONS = TIME_SLOTS.map((value) => ({
  value,
  label: TIME_SLOT_LABELS[value],
}));
export const COURSE_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

/** Kebab-case, unique per course: it is the public URL segment (docs/01). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `""` and `"[]"` both mean "not provided"; checkbox/array helpers below. */
const optionalText = (max: number, label?: string) =>
  z
    .string()
    .trim()
    .max(max, `${label ?? "This field"} is too long (max ${max} characters)`)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null));

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max} characters)`);

/** Comma-separated textarea → trimmed list with blanks removed. */
const stringList = (label: string, itemMax = 200, maxItems = 50) =>
  z
    .string()
    .trim()
    .max(itemMax * maxItems, `${label} list is too long`)
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => entry.slice(0, itemMax))
    );

/** Multi-select / checkbox group; `[]` is valid, `[""]` is not. */
const enumList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .default([])
    .transform((entries) => [...new Set(entries)]);

/**
 * Create and update share one schema (docs/05 §4.4): the form posts the same
 * fields either way, and the action decides create vs update from `id`.
 * Numbers arrive as strings from `FormData`, so they are coerced.
 */
export const courseWriteSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  title: requiredText(160, "Title"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(160, "Slug is too long")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens"),
  tagline: requiredText(200, "Tagline"),
  shortDescription: requiredText(400, "Short description"),
  overview: optionalText(20000, "Overview"),
  categoryId: cuidLike,
  level: z.enum(COURSE_LEVELS),
  durationWeeks: z.coerce
    .number()
    .int("Duration must be a whole number of weeks")
    .min(1, "Duration must be at least 1 week")
    .max(520, "Duration looks too long"),
  learningModes: enumList(LEARNING_MODES),
  timeSlots: enumList(TIME_SLOTS),
  batchFrequency: optionalText(120, "Batch frequency"),
  targetStudents: requiredText(500, "Target students"),
  prerequisites: optionalText(1000, "Prerequisites"),
  instituteCertificate: requiredText(500, "Institute certificate"),
  industryCertifications: stringList("Industry certification", 120, 20),
  internship: optionalText(1000, "Internship"),
  seatsNote: optionalText(300, "Seats note"),
  feeNPR: z.coerce
    .number()
    .int("Fee must be a whole number of rupees")
    .min(0, "Fee cannot be negative")
    .max(100_000_000, "Fee looks too large"),
  feeNote: optionalText(300, "Fee note"),
  skillsGained: stringList("Skill", 120, 40),
  softwareTools: stringList("Software tool", 120, 40),
  portfolioProjects: stringList("Portfolio project", 300, 20),
  careerOpportunities: stringList("Career opportunity", 200, 40),
  learningObjectives: stringList("Learning objective", 400, 40),
  ctaText: optionalText(200, "CTA text"),
  seoTitle: optionalText(60, "SEO title"),
  seoDescription: optionalText(160, "SEO description"),
  coverId: z
    .string()
    .trim()
    .max(64)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  status: z.enum(COURSE_STATUSES),
  isFeatured: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
    .transform((value) => value === true || value === "true" || value === "1" || value === "on")
    .default(false),
  featuredOrder: z.coerce
    .number()
    .int()
    .min(0)
    .max(999)
    .optional()
    .catch(undefined),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0).catch(0),
});

export type CourseWriteInput = z.input<typeof courseWriteSchema>;
export type CourseWriteValues = z.output<typeof courseWriteSchema>;

/**
 * Quick "duplicate as draft" (docs/05 §4.4). Reuses the slug validator so a
 * duplicate cannot silently collide with the original.
 */
export const duplicateCourseSchema = z.object({
  id: cuidLike,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(160, "Slug is too long")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens"),
});

/** Category create/update (docs/05 §4.4). `slug` is the URL fragment. */
export const categoryWriteSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  groupId: cuidLike,
  name: requiredText(120, "Category name"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(120, "Slug is too long")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens"),
  description: optionalText(1000, "Description"),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0).catch(0),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
    .transform((value) => value === true || value === "true" || value === "1" || value === "on")
    .default(true),
});

export type CategoryWriteInput = z.input<typeof categoryWriteSchema>;
export type CategoryWriteValues = z.output<typeof categoryWriteSchema>;

/** Admin list filters (docs/06 §10): every value is coerced from the URL. */
export const courseFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(COURSE_STATUSES).optional().catch(undefined),
  category: z.string().trim().max(120).optional().catch(undefined),
  featured: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
    .transform((value) => value === true || value === "true" || value === "1" || value === "on")
    .catch(false),
  page: pageParamSchema,
});

export type CourseFilters = z.infer<typeof courseFilterSchema>;

export const COURSE_PAGE_SIZE = 25;

/** Category admin filters. */
export const categoryFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  group: cuidLike.optional().catch(undefined),
  page: pageParamSchema,
});

export type CategoryFilters = z.infer<typeof categoryFilterSchema>;

export const CATEGORY_PAGE_SIZE = 25;
