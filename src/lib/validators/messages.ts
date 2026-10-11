import { z } from "zod";
import { cuidLike, pageParamSchema } from "./shared";

export const MESSAGE_STATUSES = ["NEW", "READ", "REPLIED", "ARCHIVED", "SPAM"] as const;

export const messageUpdateSchema = z.object({
  id: cuidLike,
  status: z.enum(MESSAGE_STATUSES),
  handledAt: z.union([z.string(), z.date()]).optional().nullable().transform((v) => (v ? new Date(v) : null)),
});

export type MessageUpdateInput = z.input<typeof messageUpdateSchema>;
export type MessageUpdateValues = z.output<typeof messageUpdateSchema>;

export const messageFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(MESSAGE_STATUSES).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type MessageFilters = z.output<typeof messageFilterSchema>;

