import { z } from "zod";
import {
  MESSAGE_STATUSES,
  cuidLike,
  honeypotField,
  nameSchema,
  pageParamSchema,
  phoneSchema,
  requiredEmailSchema,
  turnstileTokenSchema,
} from "./shared";

const contactFields = {
  name: nameSchema("Your name"),
  email: requiredEmailSchema,
  phone: z
    .union([phoneSchema, z.literal("")])
    .optional(),
  subject: z
    .string()
    .trim()
    .min(3, "Subject is too short")
    .max(200, "Subject is too long (max 200 characters)"),
  organization: z
    .string()
    .trim()
    .max(100, "Organization is too long (max 100 characters)")
    .optional()
    .or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(10, "Message is too short (min 10 characters)")
    .max(2000, "Message is too long (max 2,000 characters)"),
  website: honeypotField,
};

/** Browser-side form schema (`react-hook-form`). */
export const contactFormSchema = z.object(contactFields);

/**
 * Public contact form (docs/04 Phase 2 §2.1). Same rules as the browser, plus
 * the Turnstile token the widget fills in at submit time.
 */
export const contactSchema = z.object({
  ...contactFields,
  turnstileToken: turnstileTokenSchema,
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;
export type ContactInput = z.infer<typeof contactSchema>;

export const messageStatusSchema = z.enum(MESSAGE_STATUSES);

export const MESSAGE_STATUS_LABELS: Record<
  (typeof MESSAGE_STATUSES)[number],
  string
> = {
  NEW: "New",
  READ: "Read",
  REPLIED: "Replied",
  ARCHIVED: "Archived",
  SPAM: "Spam",
};

export const contactFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: messageStatusSchema.optional().catch(undefined),
  from: z
    .string()
    .trim()
    .max(40)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .trim()
    .max(40)
    .optional()
    .catch(undefined),
  page: pageParamSchema,
});

export type ContactFilters = z.infer<typeof contactFilterSchema>;

export const updateMessageStatusSchema = z.object({
  id: cuidLike,
  status: messageStatusSchema,
});

export type UpdateMessageStatusInput = z.infer<typeof updateMessageStatusSchema>;

export const MESSAGE_PAGE_SIZE = 20;
