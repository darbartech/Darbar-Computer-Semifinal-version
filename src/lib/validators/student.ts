import { z } from "zod";
import {
  cuidLike,
  nameSchema,
  optionalDateString,
  phoneSchema,
  requiredEmailSchema,
} from "./shared";

/**
 * Student-portal form schemas (public register/login and the private portal
 * editors). Imported by "use client" components (docs/02 §4: client components
 * may import validators), so this module must never import Prisma, `server-only`
 * or anything else server-side.
 */

/**
 * Student password policy. Deliberately lower than the staff minimum (10 in
 * `src/server/auth.ts`) because students are self-service and hold no staff
 * capability; 8 is still above the 6 the old stub form allowed.
 */
export const STUDENT_PASSWORD_MIN = 8;
export const STUDENT_PASSWORD_MAX = 128;

const passwordSchema = z
  .string()
  .min(STUDENT_PASSWORD_MIN, `Password must be at least ${STUDENT_PASSWORD_MIN} characters`)
  .max(STUDENT_PASSWORD_MAX, `Password is too long (max ${STUDENT_PASSWORD_MAX} characters)`);

/** Registration: better-auth's sign-in is email/password, so no phone login. */
export const studentRegisterSchema = z
  .object({
    name: nameSchema("Full name"),
    email: requiredEmailSchema,
    phone: phoneSchema.optional().or(z.literal("")),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

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

export const enrollmentDecisionSchema = z.object({
  enrollmentId: cuidLike,
  status: z.enum(["ACTIVE", "DROPPED"]),
});

export type StudentRegisterValues = z.output<typeof studentRegisterSchema>;
export type StudentLoginValues = z.output<typeof studentLoginSchema>;
export type PortfolioProjectValues = z.output<typeof portfolioProjectSchema>;
