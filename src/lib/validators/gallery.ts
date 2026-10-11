import { z } from "zod";
import { cuidLike, pageParamSchema } from "./shared";

export const GALLERY_CATEGORIES = ["CAMPUS", "LABS", "EVENTS", "CLASSES", "CERTIFICATIONS"] as const;

const optionalText = (max: number, label?: string) =>
  z
    .string()
    .trim()
    .max(max, `${label ?? "This field"} is too long (max ${max} characters)`)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null));

export const galleryItemWriteSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  mediaId: cuidLike,
  title: optionalText(160, "Title"),
  alt: z.string().trim().min(1, "Alt text is required").max(200, "Alt text must be 200 characters or fewer"),
  category: z.enum(GALLERY_CATEGORIES),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0).catch(0),
  isPublished: z.union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
    .transform((v) => v === true || v === "true" || v === "1" || v === "on")
    .default(true),
});

export type GalleryItemWriteInput = z.input<typeof galleryItemWriteSchema>;
export type GalleryItemWriteValues = z.output<typeof galleryItemWriteSchema>;

export const galleryFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.enum(GALLERY_CATEGORIES).optional().or(z.literal("")),
  isPublished: z.enum(["true", "false"]).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type GalleryFilters = z.output<typeof galleryFilterSchema>;

