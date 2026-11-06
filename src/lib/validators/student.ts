import { z } from "zod";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordProblem,
} from "../password-policy";
import {
  cuidLike,
  honeypotField,
  nameSchema,
  optionalDateString,
  phoneSchema,
  publicEmailSchema,
  requiredEmailSchema,
  turnstileTokenSchema,
} from "./shared";

/**
 * Student-portal form schemas (public register/login and the private portal
 * editors). Imported by "use client" components (docs/02 §4: client components
 * may import validators), so this module must never import Prisma, `server-only`
 * or anything else server-side.
 */

/**
 * Student password policy — the same 10 characters Better Auth enforces
 * (`emailAndPassword.minPasswordLength`, `src/server/auth.ts`) and the same
 * common-password refusal the staff forms get. Registration used to allow 8, so a
 * student could sign up and then find every later reset rejected by the library
 * with an opaque error (reaudit N12, docs 01 §S11).
 */
export const STUDENT_PASSWORD_MIN = PASSWORD_MIN_LENGTH;
export const STUDENT_PASSWORD_MAX = PASSWORD_MAX_LENGTH;

/**
 * Length, common-list and self-evident checks all come from `passwordProblem`, so
 * the field itself only bounds the size of the string. Splitting the rules across
 * two places is how the 8-vs-10 mismatch was born.
 */
const passwordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH, `Password is too long (max ${PASSWORD_MAX_LENGTH} characters)`);

/**
 * The length check above is the easy half. What the account already publishes —
 * the name, the email, the phone typed into the same form — is what a neighbour
 * guesses first, so those are refused with the rest.
 */
function rejectWeakStudentPassword(
  value: { password: string; email?: string; name?: string; phone?: string },
  ctx: z.RefinementCtx
): void {
  const problem = passwordProblem(value.password, {
    email: value.email,
    name: value.name,
    phone: value.phone,
  });
  if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
}

/**
 * Registration: better-auth's sign-in is email/password, so no phone login.
 * The two shapes follow the `contact.ts` split — the browser validates the
 * visible fields, the server action additionally requires the Turnstile token
 * the widget only fills in at submit time (docs 01 §S3).
 */
const studentRegisterFields = {
  name: nameSchema("Full name"),
  email: publicEmailSchema,
  phone: phoneSchema.optional().or(z.literal("")),
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Please confirm your password"),
  website: honeypotField,
};

const passwordConfirmation = {
  path: ["confirmPassword"],
  message: "Passwords do not match",
};

export const studentRegisterFormSchema = z
  .object(studentRegisterFields)
  .refine(
    (value) => value.password === value.confirmPassword,
    passwordConfirmation
  )
  .superRefine(rejectWeakStudentPassword);

export const studentRegisterSchema = z
  .object({
    ...studentRegisterFields,
    turnstileToken: turnstileTokenSchema,
  })
  .refine(
    (value) => value.password === value.confirmPassword,
    passwordConfirmation
  )
  .superRefine(rejectWeakStudentPassword);

export const studentLoginSchema = z.object({
  email: requiredEmailSchema,
  password: z.string().min(1, "Password is required").max(STUDENT_PASSWORD_MAX),
});

/** Optional http(s) URL: blank means "not provided". */
const optionalUrl = z
  .string()
  .trim()
  .max(300, "URL is too long")
  .refine(
    (value) => value === "" || /^https?:\/\/\S+$/i.test(value),
    "Enter a full URL starting with http:// or https://"
  )
  .optional()
  .or(z.literal(""));

/**
 * Ordered, trimmed, de-duplicated tags. The portal's text fields are split into
 * an array client-side, so the wire payload is already a `string[]`.
 */
const tagList = z
  .array(z.string().trim().min(1, "Empty item").max(40, "Item is too long"))
  .max(30, "Too many items");

const booleanInput = z.boolean();

export const PORTFOLIO_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const studentProfileSchema = z.object({
  phone: phoneSchema.optional().or(z.literal("")),
  dateOfBirth: optionalDateString,
  address: z.string().trim().max(200, "Address is too long").optional().or(z.literal("")),
  city: z.string().trim().max(100, "City is too long").optional().or(z.literal("")),
  country: z.string().trim().max(100, "Country is too long").optional().or(z.literal("")),
  headline: z.string().trim().max(140, "Headline is too long").optional().or(z.literal("")),
  bio: z.string().trim().max(2000, "Bio is too long").optional().or(z.literal("")),
  skills: tagList,
  interests: tagList,
  githubUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  websiteUrl: optionalUrl,
  portfolioSlug: z
    .string()
    .trim()
    .toLowerCase()
    .max(50, "Slug is too long")
    .regex(PORTFOLIO_SLUG_PATTERN, "Use lowercase letters, numbers and hyphens only")
    .optional()
    .or(z.literal("")),
  portfolioPublic: booleanInput,
});

export type StudentProfileValues = z.output<typeof studentProfileSchema>;

export const portfolioProjectSchema = z.object({
  id: cuidLike.optional().or(z.literal("")),
  title: z
    .string()
    .trim()
    .min(1, "Project title is required")
    .max(120, "Title is too long (max 120 characters)"),
  description: z.string().trim().max(1500, "Description is too long").optional().or(z.literal("")),
  techStack: tagList,
  liveUrl: optionalUrl,
  repoUrl: optionalUrl,
  isPublished: booleanInput,
  sortOrder: z.number().int().min(0).max(999),
});

export const portfolioProjectIdSchema = z.object({ id: cuidLike });

export const courseEnrollmentRequestSchema = z.object({ courseId: cuidLike });

export const studentIdSchema = z.object({ id: cuidLike });

export const rejectStudentSchema = z.object({
  id: cuidLike,
  reason: z
    .string()
    .trim()
    .min(3, "Give a short reason so the student knows why")
    .max(300, "Reason is too long"),
});

/**
 * Staff decision on a course request (docs 02 B1/B6). Approving always names a
 * batch — a seat is only ever taken through one — and declining always carries
 * the note the student reads back in the portal.
 */
export const approveEnrollmentSchema = z.object({
  enrollmentId: cuidLike,
  batchId: cuidLike,
});

/** Optional note on a waitlist; required on a decline — see below. */
const optionalNoteSchema = z
  .string()
  .trim()
  .max(300, "Note is too long (max 300 characters)")
  .optional()
  .or(z.literal(""));

const requiredNoteSchema = z
  .string()
  .trim()
  .min(3, "Say why, so the student knows what to fix")
  .max(300, "Note is too long (max 300 characters)");

export const waitlistEnrollmentSchema = z.object({
  enrollmentId: cuidLike,
  batchId: cuidLike.optional().or(z.literal("")),
  note: optionalNoteSchema,
});

export const declineEnrollmentSchema = z.object({
  enrollmentId: cuidLike,
  note: requiredNoteSchema,
});

export const moveEnrollmentSchema = z.object({
  enrollmentId: cuidLike,
  batchId: cuidLike,
});

export const completeEnrollmentSchema = z.object({
  enrollmentId: cuidLike,
});

export const dropEnrollmentSchema = z.object({
  enrollmentId: cuidLike,
  reason: optionalNoteSchema,
});

export type StudentRegisterValues = z.output<typeof studentRegisterSchema>;
export type StudentLoginValues = z.output<typeof studentLoginSchema>;
export type PortfolioProjectValues = z.output<typeof portfolioProjectSchema>;
