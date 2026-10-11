import { z } from "zod";
import { cuidLike } from "./shared";

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max} characters)`);

export const faqCategoryWriteSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  name: requiredText(120, "Category name"),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0).catch(0),
});

export type FaqCategoryWriteInput = z.input<typeof faqCategoryWriteSchema>;
export type FaqCategoryWriteValues = z.output<typeof faqCategoryWriteSchema>;

export const faqWriteSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  categoryId: cuidLike,
  question: requiredText(500, "Question"),
  answer: requiredText(5000, "Answer"),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0).catch(0),
  isPublished: z.union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
    .transform((v) => v === true || v === "true" || v === "1" || v === "on")
    .default(false),
});

export type FaqWriteInput = z.input<typeof faqWriteSchema>;
export type FaqWriteValues = z.output<typeof faqWriteSchema>;

