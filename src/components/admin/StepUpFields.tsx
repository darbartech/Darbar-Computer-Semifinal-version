"use client";
import * as React from "react";
import { KeyRound, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  STEP_UP_CODE_MAX,
  STEP_UP_CODE_MIN,
  type StepUpMethod,
} from "@/lib/validators/step-up";

/**
 * The one control that asks for a fresh second factor (task 2).
 *
 * Every screen that voids, issues, revokes or hands over an account ends with
 * these few lines, and `requireStepUp()` on the server is the only thing that
 * decides whether the click went through. Kept presentational on purpose: the
 * host owns the state so it can clear the code after every attempt, and the two
 * never disagree about what was submitted.
 *
 * A code is good for one 30-second window, so hosts reset this to `EMPTY_STEP_UP`
 * once a submit comes back — keeping it would only offer the server a stale code.
 */

export type StepUpValue = {
  code: string;
  method: StepUpMethod;
};

export const EMPTY_STEP_UP: StepUpValue = { code: "", method: "totp" };

/** The two keys `requireStepUp()` reads out of the action's payload. */
export function stepUpPayload(value: StepUpValue) {
  return { stepUpCode: value.code.trim(), stepUpMethod: value.method };
}

/** Enough typed to send. The server still decides whether it is the right code. */
export function isStepUpComplete(value: StepUpValue): boolean {
  return value.code.trim().length >= STEP_UP_CODE_MIN;
}

export function StepUpFields({
  value,
  onChange,
  error,
  disabled,
  idPrefix = "step-up",
}: {
  value: StepUpValue;
  onChange: (next: StepUpValue) => void;
  /** What the server answered the last code with, or a local "type it first" line. */
  error?: string | null;
  disabled?: boolean;
  /** Keeps the input's id unique when two dialogs share a page. */
  idPrefix?: string;
}) {
  const isBackup = value.method === "backup";
  const inputId = `${idPrefix}-code`;
  const errorId = `${idPrefix}-code-error`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <Label htmlFor={inputId} className="flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-neutral-500" aria-hidden="true" />
          Your authenticator code
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-my-1 h-6 px-1.5 text-xs text-neutral-600"
          disabled={disabled}
          onClick={() =>
            onChange({
              // The two kinds of code never fit each other's box.
              code: "",
              method: isBackup ? "totp" : "backup",
            })
          }
        >
          {!isBackup && <Smartphone className="size-3.5" aria-hidden="true" />}
          {isBackup ? "Use the app code" : "Use a backup code"}
        </Button>
      </div>
      <Input
        id={inputId}
        // Digits only for the app; a backup sheet is "ABCDE-FGHIJ".
        inputMode={isBackup ? "text" : "numeric"}
        autoComplete="one-time-code"
        maxLength={isBackup ? STEP_UP_CODE_MAX : STEP_UP_CODE_MIN}
        placeholder={isBackup ? "XXXXX-XXXXX" : "123456"}
        value={value.code}
        onChange={(event) =>
          onChange({
            ...value,
            code: isBackup
              ? event.target.value
              : event.target.value.replace(/\D/g, ""),
          })
        }
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="max-w-40"
      />
      <p className="text-xs text-neutral-500">
        {isBackup
          ? "Each backup code works once. They were shown when the authenticator was enrolled."
          : "Needed because this change cannot be undone from the counter."}
      </p>
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
