import { z } from "zod";
import {
  SUBSCRIBER_STATUSES,
  cuidLike,
  honeypotField,
  pageParamSchema,
  requiredEmailSchema,
  turnstileTokenSchema,
} from "./shared";

/**
 * Newsletter signup (docs/04 Phase 2 §2.1). The footer form posts to the same
 * action, so the schema also carries the honeypot and Turnstile token.
 */
export const newsletterSchema = z.object({
  email: requiredEmailSchema,
  source: z
    .string()
    .trim()
    .max(100, "Source is too long")
    .optional()
    .or(z.literal("")),
  website: honeypotField,
  turnstileToken: turnstileTokenSchema,
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;

export const SUBSCRIBER_PAGE_SIZE = 50;

export const subscriberStatusSchema = z.enum(SUBSCRIBER_STATUSES);

export const subscriberFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: subscriberStatusSchema.optional().catch(undefined),
  source: z.string().trim().max(100).optional().catch(undefined),
  page: pageParamSchema,
});

export type SubscriberFilters = z.infer<typeof subscriberFilterSchema>;

export const setSubscriberStatusSchema = z.object({
  id: cuidLike,
  status: subscriberStatusSchema,
});

export type SetSubscriberStatusInput = z.infer<typeof setSubscriberStatusSchema>;
