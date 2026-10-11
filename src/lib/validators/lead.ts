import { z } from "zod";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  MANUAL_ACTIVITY_TYPES,
  PREFERRED_BATCHES,
  cuidLike,
  honeypotField,
  nameSchema,
  optionalDateString,
  optionalEmailSchema,
  pageParamSchema,
  phoneSchema,
  turnstileTokenSchema,
  utmFields,
} from "./shared";

/**
 * Consent checkbox. Typed as `boolean` rather than `z.literal(true)` so the
 * browser form can start unchecked; the refinement is what enforces it.
 */
const consentField = z
  .boolean()
  .refine((value) => value === true, { message: "Please accept the privacy notice" });

/**
 * Fields collected by the browser form. Kept separate from `inquirySchema` so
 * the form does not have to own the Turnstile token, which the widget fills in
 * at submit time. Both are the same rules: the Server Action re-parses with
 * `inquirySchema`, so a crafted request is validated identically.
 */
const inquiryFields = {
  fullName: nameSchema("Full name"),
  phone: phoneSchema,
  email: optionalEmailSchema,
  courseSlug: z
    .string()
    .trim()
    .max(160, "Invalid course")
    .optional()
    .or(z.literal("")),
  preferredBatch: z.enum(PREFERRED_BATCHES),
  message: z
    .string()
    .trim()
    .max(1000, "Message is too long (max 1,000 characters)")
    .optional()
    .or(z.literal("")),
  consent: consentField,
  website: honeypotField,
  ...utmFields,
};

/** Browser-side form schema (`react-hook-form`). */
export const inquiryFormSchema = z.object(inquiryFields);

/**
 * Public admission inquiry (docs/04 Phase 2 §2.1, docs/06 §4).
 *
 * The same rules are enforced in the Server Action, so a crafted request
 * cannot bypass the client-side validation.
 */
export const inquirySchema = z.object({
  ...inquiryFields,
  // Defaulted here only: the form always sends a concrete value.
  preferredBatch: z.enum(PREFERRED_BATCHES).default("ANY"),
  turnstileToken: turnstileTokenSchema,
});

export type InquiryFormInput = z.infer<typeof inquiryFormSchema>;
export type InquiryInput = z.infer<typeof inquirySchema>;

export const leadStatusSchema = z.enum(LEAD_STATUSES);
export const leadSourceSchema = z.enum(LEAD_SOURCES);

/**
 * Admin list filters (docs/06 §10). Filters live in the URL, so every value is
 * coerced from a query string and an unparseable value falls back to "no
 * filter" instead of throwing on a shared link.
 */
export const leadFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: leadStatusSchema.optional().catch(undefined),
  course: z.string().trim().max(160).optional().catch(undefined),
  source: leadSourceSchema.optional().catch(undefined),
  campaign: z.string().trim().max(100).optional().catch(undefined),
  assignee: z.union([cuidLike, z.literal("unassigned")])
    .optional()
    .catch(undefined),
  from: optionalDateString.catch(undefined),
  to: optionalDateString.catch(undefined),
  followUpDue: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .transform((value) => value === true || value === "true" || value === "1")
    .catch(false),
  view: z
    .enum(["new", "mine", "follow-up-today", "all", "spam"])
    .default("all")
    .catch("all"),
  sort: z
    .enum(["createdAt", "fullName", "status", "followUpAt"])
    .default("createdAt")
    .catch("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc").catch("desc"),
  page: pageParamSchema,
});

export type LeadFilters = z.infer<typeof leadFilterSchema>;

export const LEAD_PAGE_SIZE = 25;

/** Status stepper order used by the detail page (docs/05 §4.1). */
export const LEAD_STATUS_FLOW = [
  "NEW",
  "CONTACTED",
  "COUNSELING_DONE",
  "DEMO_SCHEDULED",
  "ENROLLED",
] as const;

export const LEAD_STATUS_LABELS: Record<(typeof LEAD_STATUSES)[number], string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  COUNSELING_DONE: "Counseling done",
  DEMO_SCHEDULED: "Demo scheduled",
  ENROLLED: "Enrolled",
  LOST: "Lost",
  SPAM: "Spam",
};

/**
 * Status change (docs/05 §4.1): moving to LOST requires a reason, so the
 * reason is required by the schema instead of being a UI-only rule.
 */
export const updateLeadStatusSchema = z
  .object({
    id: cuidLike,
    status: leadStatusSchema,
    lostReason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.status === "LOST" && !value.lostReason) {
      ctx.addIssue({
        code: "custom",
        path: ["lostReason"],
        message: "Please record why this lead was lost",
      });
    }
  });

export const assignLeadSchema = z.object({
  id: cuidLike,
  assigneeId: cuidLike.nullable(),
});

export const setLeadFollowUpSchema = z.object({
  id: cuidLike,
  followUpAt: z.iso.datetime().nullable(),
});

export const addLeadActivitySchema = z.object({
  id: cuidLike,
  type: z.enum(MANUAL_ACTIVITY_TYPES),
  body: z
    .string()
    .trim()
    .min(1, "Please write something")
    .max(2000, "Note is too long (max 2,000 characters)"),
});

export const bulkLeadActionSchema = z.object({
  ids: z.array(cuidLike).min(1, "Select at least one lead").max(100),
  action: z.enum(["assign", "spam", "unassign"]),
  assigneeId: cuidLike.optional(),
});

export const deleteLeadsSchema = z.object({
  ids: z.array(cuidLike).min(1).max(50),
});

export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type AssignLeadInput = z.infer<typeof assignLeadSchema>;
export type SetLeadFollowUpInput = z.infer<typeof setLeadFollowUpSchema>;
export type AddLeadActivityInput = z.infer<typeof addLeadActivitySchema>;
export type BulkLeadActionInput = z.infer<typeof bulkLeadActionSchema>;
export type DeleteLeadsInput = z.infer<typeof deleteLeadsSchema>;
