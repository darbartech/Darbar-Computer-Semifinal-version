import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { cuidLike, pageParamSchema, requiredEmailSchema } from "./shared";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordProblem,
} from "../password-policy";

// STUDENT is deliberately absent: portal accounts are created by registration or
// by the admission flow (docs 04 §2), never from the staff users screen.
export const USER_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "EDITOR",
  "COUNSELOR",
  "INSTRUCTOR",
  "ACCOUNTANT",
  "RECEPTION",
] as const;

export const USER_ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Admin" },
  { value: "EDITOR", label: "Editor" },
  { value: "COUNSELOR", label: "Counselor" },
  { value: "INSTRUCTOR", label: "Instructor" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "RECEPTION", label: "Reception" },
] as const;

/**
 * The roles that move money or issue certificates, so a password alone is not
 * enough to hold a session (docs/08 §4, fix guide §4) and creating one of them
 * is a step-up action (task 2).
 *
 * This list lives in a client-safe module because both sides read it:
 * `src/server/session.ts` gates the admin area with it, and the users screen
 * has to know — before it submits — whether the role it just picked has to be
 * confirmed with a code.
 *
 * RECEPTION is here because it takes money (docs 05 §2: `payment.record`), and
 * the counter is the least controlled keyboard in the building.
 */
export const TWO_FACTOR_REQUIRED_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "ACCOUNTANT",
  "RECEPTION",
];

/**
 * Mirrors `emailAndPassword.minPasswordLength` in `src/server/auth.ts` so the
 * client cannot submit a password better-auth would reject (docs/08 §1).
 */
export const USER_PASSWORD_MIN = PASSWORD_MIN_LENGTH;
export const USER_PASSWORD_MAX = PASSWORD_MAX_LENGTH;

const passwordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH, `Password is too long (max ${PASSWORD_MAX_LENGTH} characters)`);

/** A staff account with a breach-list password is an open door with a login prompt. */
function rejectWeakPassword(
  value: { password: string; name?: string; email?: string },
  ctx: z.RefinementCtx,
  path: string[] = ["password"]
): void {
  const problem = passwordProblem(value.password, {
    name: value.name,
    email: value.email,
  });
  if (problem) ctx.addIssue({ code: "custom", path, message: problem });
}

const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(120, "Name is too long (max 120 characters)");

/** Checkbox / hidden input values arrive as booleans or strings. */
const activeSchema = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
  .transform((value) => value === true || value === "true" || value === "1" || value === "on")
  .default(true);

export const userCreateSchema = z
  .object({
    name: nameSchema,
    email: requiredEmailSchema,
    role: z.enum(USER_ROLES),
    password: passwordSchema,
    isActive: activeSchema,
  })
  .superRefine((value, ctx) => rejectWeakPassword(value, ctx));

export const userUpdateSchema = z.object({
  id: cuidLike,
  name: nameSchema,
  email: requiredEmailSchema,
  role: z.enum(USER_ROLES),
  isActive: activeSchema,
});

export const userActiveSchema = z.object({
  id: cuidLike,
  isActive: activeSchema,
});

export const userIdSchema = z.object({
  id: cuidLike,
});

export type UserCreateInput = z.input<typeof userCreateSchema>;
export type UserCreateValues = z.output<typeof userCreateSchema>;
export type UserUpdateInput = z.input<typeof userUpdateSchema>;
export type UserUpdateValues = z.output<typeof userUpdateSchema>;

export const userFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(USER_ROLES).optional().or(z.literal("")),
  isActive: z.enum(["true", "false"]).optional().or(z.literal("")),
  page: pageParamSchema,
});

export type UserFilters = z.output<typeof userFilterSchema>;
