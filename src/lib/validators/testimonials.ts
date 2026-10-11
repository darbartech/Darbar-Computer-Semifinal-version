import { z } from "zod";
import {
  cuidLike,
  honeypotField,
  nameSchema,
  pageParamSchema,
  turnstileTokenSchema,
} from "./shared";

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

export const testimonialWriteSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  name: requiredText(120, "Name"),
  courseId: z.string().trim().max(64).optional().or(z.literal("")).transform((v) => (v ? v : null)),
  courseLabel: optionalText(120, "Course label"),
  quote: requiredText(1000, "Quote"),
  rating: z.coerce.number().int().min(1).max(5).default(5).catch(5),
  photoId: z.string().trim().max(64).optional().or(z.literal("")).transform((v) => (v ? v : null)),
  consentGiven: z.union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
    .transform((v) => v === true || v === "true" || v === "1" || v === "on")
    .default(true),
  consentNote: optionalText(200, "Consent note"),
  isPublished: z.union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
    .transform((v) => v === true || v === "true" || v === "1" || v === "on")
    .default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0).catch(0),
});

export type TestimonialWriteInput = z.input<typeof testimonialWriteSchema>;
export type TestimonialWriteValues = z.output<typeof testimonialWriteSchema>;

export const testimonialFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  isPublished: z.enum(["true", "false"]).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type TestimonialFilters = z.output<typeof testimonialFilterSchema>;

const reviewFields = {
  name: nameSchema("Your name"),
  courseLabel: z
    .string()
    .trim()
    .max(120, "Course name is too long (max 120 characters)")
    .optional()
    .or(z.literal("")),
  rating: z
    .number()
    .int("Please choose a whole-star rating")
    .min(1, "Please choose a rating")
    .max(5, "Rating cannot exceed 5 stars"),
  quote: z
    .string()
    .trim()
    .min(10, "Your review is too short (min 10 characters)")
    .max(1000, "Your review is too long (max 1,000 characters)"),
  consentGiven: z
    .boolean()
    .refine((value) => value === true, "Please allow us to publish your review"),
  website: honeypotField,
};

/** Browser-side schema for the public "leave a review" form. */
export const reviewFormSchema = z.object(reviewFields);
export type ReviewFormInput = z.infer<typeof reviewFormSchema>;

/** Server-side schema: same rules plus the Turnstile token. */
export const reviewSchema = z.object({
  ...reviewFields,
  turnstileToken: turnstileTokenSchema,
});
export type ReviewInput = z.infer<typeof reviewSchema>;

