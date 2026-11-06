import { z } from "zod";
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "@/lib/disposable-email";

/**
 * Field primitives shared by every public form schema and by the admin lead /
 * message forms.
 *
 * These modules are imported by "use client" components (docs/02 §4), so they
 * must never import Prisma, `server-only` or anything else server-side. The
 * literal arrays below are asserted against the Prisma enums in
 * `tests/validators.test.ts` so the two cannot drift apart.
 */

export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "COUNSELING_DONE",
  "DEMO_SCHEDULED",
  "ENROLLED",
  "LOST",
  "SPAM",
] as const;

export const LEAD_SOURCES = [
  "WEBSITE_INQUIRY",
  "CONTACT_FORM",
  "WHATSAPP",
  "PHONE",
  "WALK_IN",
  "EVENT",
  "REFERRAL",
  "OTHER",
] as const;

export const PREFERRED_BATCHES = [
  "MORNING",
  "DAY",
  "EVENING",
  "WEEKEND",
  "ANY",
] as const;

/** Only the two activity types staff can create by hand. */
export const MANUAL_ACTIVITY_TYPES = ["NOTE", "CALL"] as const;

export const MESSAGE_STATUSES = [
  "NEW",
  "READ",
  "REPLIED",
  "ARCHIVED",
  "SPAM",
] as const;

/** Option list for the inquiry / filter batch selects. */
export const PREFERRED_BATCH_OPTIONS = [
  { value: "MORNING", label: "Morning (7–10 AM)" },
  { value: "DAY", label: "Day (10 AM – 4 PM)" },
  { value: "EVENING", label: "Evening (4–8 PM)" },
  { value: "WEEKEND", label: "Weekend (Sat–Sun)" },
  { value: "ANY", label: "Any — I'm flexible" },
] as const;

/**
 * `\p{L}` accepts any Unicode letter and `\p{M}` any combining mark, so
 * Devanagari names such as "सुशील आचार्य" pass (docs/06 §4). The previous
 * `[a-zA-Z]` pattern rejected every Nepali name.
 */
export const NAME_PATTERN = /^[\p{L}\p{M}\s.'’\-]+$/u;

export const nameSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(100, `${label} is too long (max 100 characters)`)
    .regex(NAME_PATTERN, "Please use letters only — no numbers or symbols");

export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Phone number seems too short")
  .max(20, "Phone number is too long")
  .regex(/^[+\d\s()-]+$/, "Please enter a valid phone number");

/**
 * Optional email: blank string and `undefined` both mean "not provided".
 *
 * `…Public` variants exist because a form that creates a record has to refuse a
 * mailbox that self-destructs, while sign-in and password reset must not — see
 * `publicEmailSchema` below.
 */
const emailShape = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long");

const INVALID_EMAIL = "Please enter a valid email address";
const isValidEmail = (value: string) => z.email().safeParse(value).success;
const isNotDisposable = (value: string) => !isDisposableEmail(value);

export const optionalEmailSchema = emailShape
  .refine((value) => value === "" || isValidEmail(value), INVALID_EMAIL)
  .optional();

export const requiredEmailSchema = emailShape.refine(isValidEmail, INVALID_EMAIL);

/** An address the institute can still reach next month. */
export const publicEmailSchema = requiredEmailSchema.refine(
  isNotDisposable,
  DISPOSABLE_EMAIL_MESSAGE
);

/** Optional sibling of `publicEmailSchema`: blank still means "not provided". */
export const optionalPublicEmailSchema = emailShape
  .refine((value) => value === "" || isValidEmail(value), INVALID_EMAIL)
  .refine(isNotDisposable, DISPOSABLE_EMAIL_MESSAGE)
  .optional();

/**
 * Honeypot (docs/06 §8). The field is rendered hidden and must stay empty.
 * Validation deliberately accepts any value: rejecting it here would return a
 * field error naming `website`, teaching the bot which field to leave blank and
 * replacing the silent drop in the action with a very informative failure.
 */
export const honeypotField = z.string().max(2000).optional();

/** Campaign parameters read from the URL by the public forms. */
export const utmFields = {
  utmSource: z.string().trim().max(100).optional().or(z.literal("")),
  utmMedium: z.string().trim().max(100).optional().or(z.literal("")),
  utmCampaign: z.string().trim().max(100).optional().or(z.literal("")),
} as const;

/**
 * Turnstile token (docs/06 §8). The widget posts `DEV_TURNSTILE_BYPASS` when no
 * site key is configured, which the action only accepts outside production.
 */
export const TURNSTILE_DEV_BYPASS = "dev-turnstile-bypass";

export const turnstileTokenSchema = z
  .string()
  .trim()
  .min(1, "Please complete the anti-spam check")
  .max(2048, "Invalid verification token");

/** Date picker / query-string date inputs (`""` means "not set"). */
export const optionalDateString = z
  .string()
  .trim()
  .max(40, "Invalid date")
  .optional()
  .or(z.literal(""));

export const cuidLike = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Invalid id")
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid id");

/** URL query-string integer with a default (`?page=2`). */
export const pageParamSchema = z.coerce.number().int().min(1).catch(1);
