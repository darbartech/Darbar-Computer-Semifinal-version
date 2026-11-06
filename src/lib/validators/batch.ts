import { z } from "zod";
import { cuidLike, pageParamSchema } from "./shared";

export const BATCH_STATUSES = ["UPCOMING", "OPEN", "FULL", "RUNNING", "COMPLETED", "CANCELLED"] as const;
/**
 * `FULL` is derived from `seatsTaken >= seatsTotal` and shown by the UI; staff
 * never set it and a form submission cannot write it (docs 02 B1). The enum
 * value stays in the schema for rows that predate the change.
 */
export const BATCH_WRITE_STATUSES = [
  "UPCOMING",
  "OPEN",
  "RUNNING",
  "COMPLETED",
  "CANCELLED",
] as const;
export const TIME_SLOTS = ["MORNING", "DAY", "EVENING", "WEEKEND"] as const;

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max} characters)`);

/**
 * `seatsTaken` is deliberately absent: it is maintained only by enrollment
 * transitions (approve / decline / move), so the batch form shows it read-only
 * and no staff edit can overwrite the count.
 */
export const batchWriteSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  courseId: cuidLike,
  name: requiredText(120, "Batch name"),
  startDate: z.union([z.string(), z.date()]).transform((v) => new Date(v)),
  timeSlot: z.enum(TIME_SLOTS),
  seatsTotal: z.coerce.number().int().min(0).max(10000),
  status: z.enum(BATCH_WRITE_STATUSES),
  /**
   * Teacher of record (fix guide §5). Optional: an unassigned batch is normal
   * for a course that has not started, and the DAL rejects an id that is not an
   * active INSTRUCTOR rather than trusting the dropdown.
   */
  instructorId: cuidLike.optional().or(z.literal("")),
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

