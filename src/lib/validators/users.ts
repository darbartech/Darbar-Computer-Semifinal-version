import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { cuidLike, pageParamSchema, requiredEmailSchema } from "./shared";

export const USER_ROLES: readonly Role[] = ["SUPER_ADMIN", "ADMIN", "EDITOR", "COUNSELOR"] as const;

export const USER_ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Admin" },
  { value: "EDITOR", label: "Editor" },
  { value: "COUNSELOR", label: "Counselor" },
] as const;

/**
 * Mirrors `emailAndPassword.minPasswordLength` in `src/server/auth.ts` so the
 * client cannot submit a password better-auth would reject (docs/08 §1).
 */
export const USER_PASSWORD_MIN = 10;
export const USER_PASSWORD_MAX = 128;

const passwordSchema = z
  .string()
  .min(USER_PASSWORD_MIN, `Password must be at least ${USER_PASSWORD_MIN} characters`)
  .max(USER_PASSWORD_MAX, `Password is too long (max ${USER_PASSWORD_MAX} characters)`);

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

export const userCreateSchema = z.object({
  name: nameSchema,
  email: requiredEmailSchema,
  role: z.enum(USER_ROLES),
  password: passwordSchema,
  isActive: activeSchema,
});

export const userUpdateSchema = z.object({
  id: cuidLike,
  name: nameSchema,
  email: requiredEmailSchema,
  role: z.enum(USER_ROLES),
  isActive: activeSchema,
});

export const userPasswordSchema = z.object({
  id: cuidLike,
  password: passwordSchema,
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
