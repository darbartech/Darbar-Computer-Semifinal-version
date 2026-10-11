import { z } from "zod";
import { cuidLike, pageParamSchema } from "./shared";

export const PUBLISH_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
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

export const blogWriteSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  title: requiredText(160, "Title"),
  slug: z.string().trim().toLowerCase().max(160, "Slug is too long").regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens"),
  excerpt: requiredText(400, "Excerpt"),
  contentMd: requiredText(50000, "Content"),
  coverId: z.string().trim().max(64).optional().or(z.literal("")).transform((value) => (value ? value : null)),
  authorName: optionalText(120, "Author name"),
  readingMinutes: z.coerce.number().int().min(1).max(120).default(1).catch(1),
  seoTitle: optionalText(60, "SEO title"),
  seoDescription: optionalText(160, "SEO description"),
  status: z.enum(PUBLISH_STATUSES),
  publishedAt: z.union([z.string(), z.date()]).optional().nullable().transform((v) => (v ? new Date(v) : null)),
  tags: stringList("Tags", 60, 30),
});

export type BlogWriteInput = z.input<typeof blogWriteSchema>;
export type BlogWriteValues = z.output<typeof blogWriteSchema>;

export const blogFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(PUBLISH_STATUSES).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type BlogFilters = z.output<typeof blogFilterSchema>;

