"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  EMPTY_STEP_UP,
  isStepUpComplete,
  StepUpFields,
  stepUpPayload,
  type StepUpValue,
} from "@/components/admin/StepUpFields";
import { voidInvoiceAction, voidPaymentAction } from "@/server/actions/fees";

export type VoidTarget = {
  kind: "invoice" | "receipt";
  id: string;
  /** Number + name, quoted back to the clerk so the wrong row cannot be voided. */
  subject: string;
};

const COPY = {
  invoice: {
    title: "Void invoice",
    description:
      "A void invoice stops being a bill but stays in the list with its receipts — the ledger is never rewritten. Corrections are made by issuing a new invoice.",
    confirm: "Void invoice",
    toastTitle: "Invoice voided",
    failure: "Could not void invoice",
  },
  receipt: {
    title: "Void receipt",
    description:
      "The receipt keeps its number and is marked VOIDED, and the invoice balance and status are recomputed from the money that is left.",
    confirm: "Void receipt",
    toastTitle: "Receipt voided",
    failure: "Could not void receipt",
  },
} as const;

/**
 * One dialog for both voids (docs 05 §2). The reason is mandatory: a void without
 * one is indistinguishable from a mistake a year later, and this text is the only
 * place it is recorded besides the audit entry.
 *
 * Task 2 adds the second half of the confirmation: a fresh authenticator code, so
 * the click is made by the person who holds the phone and not by their open tab.
 */
export function VoidDialog({
  target,
  onOpenChange,
}: {
  target: VoidTarget | null;
  onOpenChange: (target: VoidTarget | null) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [reason, setReason] = React.useState("");
  const [stepUp, setStepUp] = React.useState<StepUpValue>(EMPTY_STEP_UP);
  const [stepUpError, setStepUpError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const open = target !== null;
  const copy = target ? COPY[target.kind] : null;

  const close = () => {
    setReason("");
    setStepUp(EMPTY_STEP_UP);
    setStepUpError(null);
    setFieldErrors({});
    onOpenChange(null);
  };

  const onSubmit = async () => {
    if (!target || !copy) return;
    setSubmitting(true);
    setStepUpError(null);
    try {
      const payload = { id: target.id, reason: reason.trim(), ...stepUpPayload(stepUp) };
      const result =
        target.kind === "invoice" ? await voidInvoiceAction(payload) : await voidPaymentAction(payload);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        // A refused code is read at the box it was typed into, not only in a toast.
        if (!result.fieldErrors) setStepUpError(result.error);
        toast({ title: copy.failure, description: result.error, variant: "error" });
        return;
      }
      toast({
        title: copy.toastTitle,
        description: `${target.subject} is voided; the reason is in the audit log.`,
        variant: "success",
      });
      close();
      router.refresh();
    } finally {
      setSubmitting(false);
      // The window closed either way: the next click needs the code that is valid
      // then, not the one that was typed up to a minute ago.
      setStepUp(EMPTY_STEP_UP);
    }
  };

  if (!open || !copy || !target) return null;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent
        className="sm:max-w-md"
        key={target.id}
        aria-labelledby="void-dialog-title"
        aria-describedby="void-dialog-description"
      >
        <DialogHeader>
          <DialogTitle id="void-dialog-title" className="flex items-center gap-2">
            <ShieldOff className="size-5 text-destructive" />
            {copy.title}
          </DialogTitle>
          <DialogDescription id="void-dialog-description">{copy.description}</DialogDescription>
        </DialogHeader>

        <div>
          <p className="text-sm font-medium text-neutral-900">{target.subject}</p>
          <Label htmlFor="void-reason" className="mb-1.5 mt-3 block text-sm font-medium">
            Reason
          </Label>
          <Textarea
            id="void-reason"
            rows={3}
            value={reason}
            maxLength={500}
            placeholder="Duplicate bill for the same batch"
            onChange={(event) => setReason(event.target.value)}
            disabled={submitting}
            aria-invalid={fieldErrors.reason ? true : undefined}
          />
          {fieldErrors.reason?.[0] ? (
            <p className="mt-1 text-xs font-medium text-destructive">{fieldErrors.reason[0]}</p>
          ) : null}

          <div className="mt-4">
            <StepUpFields
              value={stepUp}
              onChange={setStepUp}
              error={stepUpError}
              disabled={submitting}
              idPrefix="void"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            type="button"
            disabled={submitting || reason.trim().length === 0 || !isStepUpComplete(stepUp)}
            onClick={onSubmit}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
