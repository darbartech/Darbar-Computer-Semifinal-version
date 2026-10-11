import { z } from "zod";
import { cuidLike, optionalDateString, pageParamSchema } from "./shared";

/**
 * Client-safe schemas for the assignments module (docs/02 §4): these are
 * imported by "use client" forms, so nothing here may import Prisma or
 * `server-only`. The literal arrays are asserted against the Prisma enums in
 * `tests/validators.test.ts`.
 */

/** Mirrors Prisma `PublishStatus`. */
export const ASSIGNMENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

/** Mirrors Prisma `SubmissionReviewStatus`. */
export const SUBMISSION_REVIEW_STATUSES = ["SUBMITTED", "REVIEWED", "NEEDS_WORK"] as const;

/** Only the two verdicts an instructor can set; SUBMITTED belongs to the student. */
export const REVIEW_DECISIONS = ["REVIEWED", "NEEDS_WORK"] as const;

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max} characters)`);

/**
 * The task link a student submits. Restricted to `http(s)` because the value
 * renders straight into an `href` in both the admin and student tables — this
 * is the stored-XSS boundary for the module.
 */
export const submissionUrlSchema = z
  .string()
  .trim()
  .min(1, "Paste the link to your task")
  .max(500, "URL is too long")
  .refine(
    (value) => /^https?:\/\/\S+$/i.test(value),
    "Enter a full URL starting with http:// or https://"
  );

/**
 * Create and update share one schema, like `courseWriteSchema`: the form posts
 * the same fields either way and the action decides create vs update from `id`.
 * `studentIds` is the ticked list and always replaces the previous one — the
 * course alone never grants a task.
 */
export const assignmentWriteSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  courseId: cuidLike,
  title: requiredText(140, "Title"),
  instructions: z.string().trim().max(4000, "Instructions are too long (max 4000 characters)").optional().or(z.literal("")),
  dueDate: optionalDateString,
  status: z.enum(ASSIGNMENT_STATUSES),
  studentIds: z
    .array(cuidLike)
    .min(1, "Choose at least one student")
    .max(500, "That is a lot of students — split it across two assignments"),
});

export type AssignmentWriteInput = z.input<typeof assignmentWriteSchema>;
export type AssignmentWriteValues = z.output<typeof assignmentWriteSchema>;

export const assignmentFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  courseId: cuidLike.optional().or(z.literal("")),
  status: z.enum(ASSIGNMENT_STATUSES).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type AssignmentFilters = z.output<typeof assignmentFilterSchema>;

export const assignmentIdSchema = z.object({ id: cuidLike });

/** Instructor verdict on one submission, with an optional short note. */
export const submissionReviewSchema = z.object({
  assignmentId: cuidLike,
  submissionId: cuidLike,
  reviewStatus: z.enum(REVIEW_DECISIONS),
  reviewNote: z.string().trim().max(1000, "Feedback is too long (max 1000 characters)").optional().or(z.literal("")),
});

export type SubmissionReviewInput = z.input<typeof submissionReviewSchema>;

/** A student posts (or replaces) the link for one assignment. */
export const submissionWriteSchema = z.object({
  assignmentId: cuidLike,
  url: submissionUrlSchema,
});

export type SubmissionWriteInput = z.input<typeof submissionWriteSchema>;
