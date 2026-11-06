import { z } from "zod";
import { requiredEmailSchema, turnstileTokenSchema } from "./shared";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordProblem } from "../password-policy";

/**
 * Forgot / reset password schemas (docs 01 §S4). Both portals share one link
 * format, so the form declares which page it belongs to; that decides where the
 * email's redirect lands and where the browser goes after a successful reset.
 */

/** Kept as a name because the staff form and its copy both reach for it. */
export const STAFF_PASSWORD_MIN = PASSWORD_MIN_LENGTH;

/** Better Auth's reset tokens are 24 random bytes, base64url-ish. */
const resetTokenSchema = z
  .string()
  .trim()
  .min(10, "This reset link looks incomplete. Request a new one.")
  .max(128, "This reset link looks incomplete. Request a new one.");

export const passwordResetPortalSchema = z.enum(["student", "staff"]);

export const passwordResetRequestSchema = z.object({
  email: requiredEmailSchema,
  turnstileToken: turnstileTokenSchema,
  portal: passwordResetPortalSchema,
});

/**
 * Reset form. One password policy for both portals: Better Auth's
 * `minPasswordLength` (10, `src/server/auth.ts`) is global and is applied to
 * `/reset-password`, so a student choosing the 8 characters registration used to
 * allow would be rejected by the library with an opaque error. Asking for 10 up
 * front, and refusing the passwords on every breach dump, keeps the form honest
 * about what will actually be accepted.
 */
const passwordFields = {
  newPassword: z
    .string()
    .max(PASSWORD_MAX_LENGTH, `Password is too long (max ${PASSWORD_MAX_LENGTH} characters)`),
  confirmPassword: z.string().min(1, "Please confirm your password"),
};

/**
 * A reset is what someone does after their password leaked, so the new one must
 * not be the guessable kind either. The form knows no name or phone here — the
 * token identifies the account — so only the shared list is consulted.
 */
function rejectWeakNewPassword(value: { newPassword: string }, ctx: z.RefinementCtx): void {
  const problem = passwordProblem(value.newPassword);
  if (problem) ctx.addIssue({ code: "custom", path: ["newPassword"], message: problem });
}

const CONFIRMATION_RULE = {
  path: ["confirmPassword"],
  message: "Passwords do not match",
};

/**
 * Client-side validator for the two password inputs alone. The browser never
 * sends the token through this schema, and an object carrying a refinement
 * cannot be `omit()`ed, so the form and the action each declare their own
 * shape over the same fields.
 */
export const newPasswordPairSchema = z
  .object(passwordFields)
  .refine((value) => value.newPassword === value.confirmPassword, CONFIRMATION_RULE)
  .superRefine(rejectWeakNewPassword);

export const passwordResetSchema = z
  .object({
    token: resetTokenSchema,
    portal: passwordResetPortalSchema,
    ...passwordFields,
  })
  .refine((value) => value.newPassword === value.confirmPassword, CONFIRMATION_RULE)
  .superRefine(rejectWeakNewPassword);

export type PasswordResetRequestValues = z.output<typeof passwordResetRequestSchema>;
export type PasswordResetValues = z.output<typeof passwordResetSchema>;
