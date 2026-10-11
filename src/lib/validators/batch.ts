import { z } from "zod";
import { cuidLike, pageParamSchema } from "./shared";

export const BATCH_STATUSES = ["UPCOMING", "OPEN", "FULL", "RUNNING", "COMPLETED", "CANCELLED"] as const;
export const TIME_SLOTS = ["MORNING", "DAY", "EVENING", "WEEKEND"] as const;

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max} characters)`);

export const batchWriteSchema = z
  .object({
    id: cuidLike.optional().or(z.literal("")),
    courseId: cuidLike,
    name: requiredText(120, "Batch name"),
    startDate: z.union([z.string(), z.date()]).transform((v) => new Date(v)),
    timeSlot: z.enum(TIME_SLOTS),
    seatsTotal: z.coerce.number().int().min(0).max(10000),
    seatsTaken: z.coerce.number().int().min(0).max(10000).default(0).catch(0),
    status: z.enum(BATCH_STATUSES),
  })
  .refine((data) => data.seatsTaken <= data.seatsTotal, {
    message: "Seats taken cannot exceed total seats",
    path: ["seatsTaken"],
  });

export type BatchWriteInput = z.input<typeof batchWriteSchema>;
export type BatchWriteValues = z.output<typeof batchWriteSchema>;

export const batchFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  courseId: cuidLike.optional().or(z.literal("")),
  status: z.enum(BATCH_STATUSES).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type BatchFilters = z.output<typeof batchFilterSchema>;

