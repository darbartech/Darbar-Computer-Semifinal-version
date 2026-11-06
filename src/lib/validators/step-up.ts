import { z } from "zod";

/**
 * The second factor that rides along with a sensitive write (task 2).
 *
 * `requireStepUp()` in `src/server/services/step-up.ts` reads these two fields out
 * of the payload a server action was already given and checks the code against the
 * signed-in staff member's own authenticator, so a session copied out of a browser
 * is not enough: the attacker still needs the phone.
 *
 * The schema lives here, and not beside the check, because `src/components/admin`
 * validates the same lengths in the browser and a "use client" file cannot import
 * from `src/server`.
 */

/** How wide a code is accepted: 6 digits from the app, 11 characters from a backup sheet. */
export const STEP_UP_CODE_MIN = 6;
export const STEP_UP_CODE_MAX = 16;

export const STEP_UP_CODE_MESSAGE = `Enter the ${STEP_UP_CODE_MIN}-digit code from your authenticator app`;

export const stepUpMethodSchema = z.enum(["totp", "backup"]).default("totp");

export type StepUpMethod = z.output<typeof stepUpMethodSchema>;

export const stepUpSchema = z.object({
  stepUpCode: z
    .string()
    .trim()
    .min(STEP_UP_CODE_MIN, STEP_UP_CODE_MESSAGE)
    .max(STEP_UP_CODE_MAX, STEP_UP_CODE_MESSAGE),
  stepUpMethod: stepUpMethodSchema,
});

export type StepUpValues = z.output<typeof stepUpSchema>;
