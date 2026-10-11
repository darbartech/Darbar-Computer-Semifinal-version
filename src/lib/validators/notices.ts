import { z } from "zod";
import { cuidLike, optionalDateString, pageParamSchema } from "./shared";

/**
 * Client-safe schemas for site notices (docs/02 §4): imported by "use client"
 * forms, so nothing here may import Prisma or `server-only`. The literal arrays
 * are asserted against the Prisma enums in `tests/validators.test.ts`.
 */

/** Mirrors Prisma `PublishStatus`. */
export const NOTICE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

/** Mirrors Prisma `NoticeType`. */
export const NOTICE_TYPES = ["HOLIDAY", "CLOSURE", "ANNOUNCEMENT"] as const;

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max} characters)`);

/**
 * Create and update share one schema, like `assignmentWriteSchema`: the form
 * posts the same fields either way and the action decides which from `id`.
 * The two dates are plain `YYYY-MM-DD` strings from the date inputs; `""` means
 * "undated", which is what an open-ended announcement wants. `imageId` follows
 * the same `""`-means-none rule and points at a row in the media library.
 */
export const noticeWriteSchema = z
  .object({
    id: cuidLike.optional().or(z.literal("")),
    type: z.enum(NOTICE_TYPES),
    title: requiredText(140, "Title"),
    body: requiredText(1500, "Message"),
    startsAt: optionalDateString,
    endsAt: optionalDateString,
    status: z.enum(NOTICE_STATUSES),
    imageId: z
      .string()
      .trim()
      .max(64, "Invalid image")
      .optional()
      .or(z.literal(""))
      .transform((value) => (value ? value : null)),
  })
  .refine(
    (data) => !data.startsAt || !data.endsAt || data.endsAt >= data.startsAt,
    { message: "The end date is before the start date", path: ["endsAt"] }
  );

export type NoticeWriteInput = z.input<typeof noticeWriteSchema>;
export type NoticeWriteValues = z.output<typeof noticeWriteSchema>;

export const noticeFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(NOTICE_STATUSES).optional().or(z.literal("")),
  type: z.enum(NOTICE_TYPES).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type NoticeFilters = z.output<typeof noticeFilterSchema>;

export const noticeIdSchema = z.object({ id: cuidLike });
