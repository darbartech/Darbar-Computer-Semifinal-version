import { z } from "zod";
import { cuidLike, pageParamSchema } from "./shared";

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

export const teamMemberWriteSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  name: requiredText(120, "Name"),
  role: requiredText(120, "Role"),
  specialty: optionalText(160, "Specialty"),
  bio: optionalText(2000, "Bio"),
  photoId: z.string().trim().max(64).optional().or(z.literal("")).transform((v) => (v ? v : null)),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0).catch(0),
  isPublished: z.union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
    .transform((v) => v === true || v === "true" || v === "1" || v === "on")
    .default(false),
});

export type TeamMemberWriteInput = z.input<typeof teamMemberWriteSchema>;
export type TeamMemberWriteValues = z.output<typeof teamMemberWriteSchema>;

export const teamFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  isPublished: z.enum(["true", "false"]).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type TeamFilters = z.output<typeof teamFilterSchema>;

