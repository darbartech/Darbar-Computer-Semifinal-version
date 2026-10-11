import { z } from "zod";
import { cuidLike, pageParamSchema } from "./shared";

export const EVENT_STATUSES = ["DRAFT", "PUBLISHED", "CANCELLED"] as const;
export const EVENT_CATEGORIES = ["WORKSHOP", "SEMINAR", "OPEN_HOUSE", "CERTIFICATION", "OTHER"] as const;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export const eventWriteSchema = z
  .object({
    id: cuidLike.optional().or(z.literal("")),
    title: requiredText(160, "Title"),
    slug: z.string().trim().toLowerCase().max(160, "Slug is too long").regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens"),
    category: z.enum(EVENT_CATEGORIES),
    startsAt: z.union([z.string(), z.date()]).transform((v) => new Date(v)),
    endsAt: z.union([z.string(), z.date()]).optional().nullable().transform((v) => (v ? new Date(v) : null)),
    location: requiredText(200, "Location"),
    shortDescription: requiredText(400, "Short description"),
    fullDescription: requiredText(20000, "Full description"),
    coverId: z.string().trim().max(64).optional().or(z.literal("")).transform((value) => (value ? value : null)),
    registrationUrl: optionalText(2048, "Registration URL"),
    capacity: z.coerce.number().int().min(0).max(10000).optional().nullable(),
    status: z.enum(EVENT_STATUSES),
  })
  .refine(
    (data) => {
      if (data.endsAt && data.startsAt) return data.endsAt >= data.startsAt;
      return true;
    },
    { message: "End date must be after start date", path: ["endsAt"] }
  );

export type EventWriteInput = z.input<typeof eventWriteSchema>;
export type EventWriteValues = z.output<typeof eventWriteSchema>;

export const eventFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(EVENT_STATUSES).optional().or(z.literal("")),
  category: z.enum(EVENT_CATEGORIES).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type EventFilters = z.output<typeof eventFilterSchema>;

