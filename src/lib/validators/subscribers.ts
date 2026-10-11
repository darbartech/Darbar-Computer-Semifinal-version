import { z } from "zod";
import { cuidLike, pageParamSchema } from "./shared";

export const SUBSCRIBER_STATUSES = ["ACTIVE", "UNSUBSCRIBED"] as const;

export const subscriberUpdateSchema = z.object({
  id: cuidLike,
  status: z.enum(SUBSCRIBER_STATUSES),
});

export type SubscriberUpdateInput = z.input<typeof subscriberUpdateSchema>;
export type SubscriberUpdateValues = z.output<typeof subscriberUpdateSchema>;

export const subscriberFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(SUBSCRIBER_STATUSES).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type SubscriberFilters = z.output<typeof subscriberFilterSchema>;

