"use client";
import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EMPTY_STEP_UP,
  isStepUpComplete,
  StepUpFields,
  stepUpPayload,
  type StepUpValue,
} from "./StepUpFields";

/**
 * The same second factor as `StepUpFields`, standing on its own for the row
 * buttons that have no form to sit in — deleting a user, resetting someone else's
 * two-factor. One dialog, reused wherever a click needs proving.
 *
 * It only ever hands the code to the host; it never calls an action itself, so the
 * host stays in charge of what the permission check, the reason text and the audit
 * entry look like.
 */
export function StepUpDialog({
  open,
  title,
  description,
  confirmLabel,
  variant = "destructive",
  pending = false,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  variant?: "destructive" | "default";
  pending?: boolean;
  /** The server's answer to the last code, shown under the box. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: (payload: ReturnType<typeof stepUpPayload>) => void;
}) {
  const [stepUp, setStepUp] = React.useState<StepUpValue>(EMPTY_STEP_UP);

  // Every way out of this dialog clears the box, so it is never reopened with the
  // code from a closed 30-second window: `confirm` resets after handing the digits
  // over, and the host re-renders it only after one of those two paths.
  const cancel = () => {
    setStepUp(EMPTY_STEP_UP);
    onCancel();
  };

  const confirm = () => {
    onConfirm(stepUpPayload(stepUp));
    setStepUp(EMPTY_STEP_UP);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : cancel())}>
      <DialogContent
        className="sm:max-w-md"
        aria-labelledby="step-up-dialog-title"
        aria-describedby="step-up-dialog-description"
      >
        <DialogHeader>
          <DialogTitle id="step-up-dialog-title" className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription id="step-up-dialog-description">{description}</DialogDescription>
        </DialogHeader>

        <StepUpFields
          value={stepUp}
          onChange={setStepUp}
          error={error}
          disabled={pending}
          idPrefix="step-up-dialog"
        />

        <DialogFooter>
          <Button variant="outline" type="button" onClick={cancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={variant}
            type="button"
            disabled={pending || !isStepUpComplete(stepUp)}
            onClick={confirm}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
