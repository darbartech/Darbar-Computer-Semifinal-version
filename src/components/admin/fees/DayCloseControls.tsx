"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { closeDayAction, reopenDayAction } from "@/server/actions/fees";
import type { DayClosure } from "@/server/types/fees";
import { formatDateTime, formatNPR } from "@/lib/format";

/**
 * Counting the drawer and shutting one campus day (fix guide §2).
 *
 * The counted cash is shown next to what the receipts add up to, so the day is
 * closed against a difference the clerk can see rather than a total they have to
 * trust. Once shut, the day takes no new receipts and no voids — reopening is an
 * admin's move, needs a reason, and needs a fresh authenticator code (task 2):
 * the day is the number the institute has already handed over.
 */
export function DayCloseControls({
  day,
  cashSystem,
  closure,
  canClose,
  canReopen,
}: {
  day: string;
  cashSystem: number;
  closure: DayClosure | null;
  canClose: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = React.useState<"close" | "reopen" | null>(null);
  const [cash, setCash] = React.useState("");
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [stepUp, setStepUp] = React.useState<StepUpValue>(EMPTY_STEP_UP);
  const [stepUpError, setStepUpError] = React.useState<string | null>(null);

  const closeDialog = () => {
    setMode(null);
    setCash("");
    setNote("");
    setReason("");
    setFieldErrors({});
    setStepUp(EMPTY_STEP_UP);
    setStepUpError(null);
  };

  const onSubmit = async () => {
    if (!mode) return;
    setSubmitting(true);
    try {
      if (mode === "close") {
        const result = await closeDayAction({
          day,
          cashCounted: cash.trim() === "" ? "" : cash.trim(),
          note: note.trim(),
        });
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast({ title: "Could not close the day", description: result.error, variant: "error" });
          return;
        }
        toast({
          title: `${result.data.day} closed`,
          description:
            result.data.difference === null
              ? "The day is shut; no receipts or voids will land on it."
              : `${result.data.difference === 0 ? "Drawer matches the ledger" : drawerSentence(result.data.difference)}. The day now takes no new money.`,
          variant: "success",
        });
      } else {
        const result = await reopenDayAction({
          day,
          reason: reason.trim(),
          ...stepUpPayload(stepUp),
        });
        // Whether it was spent or refused, the code belongs to a window that has
        // now passed; a second attempt is typed fresh.
        setStepUp(EMPTY_STEP_UP);
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          setStepUpError(result.fieldErrors ? null : result.error);
          toast({ title: "Could not reopen the day", description: result.error, variant: "error" });
          return;
        }
        toast({
          title: `${day} reopened`,
          description: `${result.data.receipts} receipt(s) are editable again; the reason is in the audit log.`,
          variant: "success",
        });
      }
      closeDialog();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {closure ? (
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <Lock className="size-4 text-primary" />
              Day closed
            </p>
            <p className="text-sm text-neutral-600">
              {closure.cashCounted === null
                ? `Cash not counted — ${formatNPR(cashSystem)} in the ledger.`
                : `Counted ${formatNPR(closure.cashCounted)} against ${formatNPR(cashSystem)} in the ledger — ${drawerSentence(closure.cashCounted - cashSystem)}.`}
            </p>
            <p className="text-xs text-neutral-500">
              {closure.closedByName ?? "A clerk"} · {formatDateTime(closure.closedAt)}
              {closure.note ? ` — ${closure.note}` : ""}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-neutral-900">Day is still open</p>
            <p className="text-sm text-neutral-600">
              Receipts dated {day} land on this book. Cash collected so far:{" "}
              <span className="font-semibold tabular-nums text-neutral-900">
                {formatNPR(cashSystem)}
              </span>
              .
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {closure ? (
            canReopen ? (
              <Button variant="outline" size="sm" onClick={() => setMode("reopen")}>
                <LockOpen className="size-4" />
                Reopen day
              </Button>
            ) : null
          ) : (
            canClose ? (
              <Button size="sm" onClick={() => setMode("close")}>
                <Lock className="size-4" />
                Close day
              </Button>
            ) : null
          )}
        </div>
      </div>

      <Dialog open={mode !== null} onOpenChange={(next) => (next ? undefined : closeDialog())}>
        <DialogContent
          className="sm:max-w-md"
          aria-labelledby="day-close-title"
          aria-describedby="day-close-description"
        >
          <DialogHeader>
            <DialogTitle id="day-close-title" className="flex items-center gap-2">
              {mode === "reopen" ? (
                <LockOpen className="size-5 text-destructive" />
              ) : (
                <Lock className="size-5 text-primary" />
              )}
              {mode === "reopen" ? "Reopen day" : "Close day"}
            </DialogTitle>
            <DialogDescription id="day-close-description">
              {mode === "reopen"
                ? "Reopening lets receipts be added to or voided on a day whose money has already been handed over. The reason is recorded in the audit log."
                : "A closed day takes no new receipts and no voids. Record what is in the drawer next to what the system counted."}
            </DialogDescription>
          </DialogHeader>

          {mode === "close" ? (
            <div className="flex flex-col gap-4">
              <div>
                <Label htmlFor="day-cash-counted" className="mb-1.5 block text-sm font-medium">
                  Cash counted (NPR)
                </Label>
                <Input
                  id="day-cash-counted"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={cash}
                  placeholder={String(cashSystem)}
                  onChange={(event) => setCash(event.target.value)}
                  disabled={submitting}
                  aria-invalid={fieldErrors.cashCounted ? true : undefined}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  System total:{" "}
                  <span className="font-semibold tabular-nums text-neutral-700">
                    {formatNPR(cashSystem)}
                  </span>
                  . Leave empty to close on the system total without counting.
                </p>
                {fieldErrors.cashCounted?.[0] ? (
                  <p className="mt-1 text-xs font-medium text-destructive">
                    {fieldErrors.cashCounted[0]}
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="day-close-note" className="mb-1.5 block text-sm font-medium">
                  Note
                </Label>
                <Textarea
                  id="day-close-note"
                  rows={3}
                  value={note}
                  maxLength={300}
                  placeholder="Short deposit slip number, if any"
                  onChange={(event) => setNote(event.target.value)}
                  disabled={submitting}
                  aria-invalid={fieldErrors.note ? true : undefined}
                />
                {fieldErrors.note?.[0] ? (
                  <p className="mt-1 text-xs font-medium text-destructive">{fieldErrors.note[0]}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <Label htmlFor="day-reopen-reason" className="mb-1.5 block text-sm font-medium">
                  Reason
                </Label>
                <Textarea
                  id="day-reopen-reason"
                  rows={3}
                  value={reason}
                  maxLength={500}
                  placeholder="A receipt was missed and has to be added"
                  onChange={(event) => setReason(event.target.value)}
                  disabled={submitting}
                  aria-invalid={fieldErrors.reason ? true : undefined}
                />
                {fieldErrors.reason?.[0] ? (
                  <p className="mt-1 text-xs font-medium text-destructive">{fieldErrors.reason[0]}</p>
                ) : null}
              </div>
              <StepUpFields
                value={stepUp}
                onChange={(next) => {
                  setStepUp(next);
                  setStepUpError(null);
                }}
                error={stepUpError}
                disabled={submitting}
                idPrefix="day-reopen"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={mode === "reopen" ? "destructive" : "default"}
              disabled={
                submitting ||
                (mode === "reopen" &&
                  (reason.trim().length === 0 || !isStepUpComplete(stepUp)))
              }
              onClick={onSubmit}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "reopen" ? "Reopen day" : "Close day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** The gap in clerk's words: over means the drawer has more than the ledger says. */
function drawerSentence(difference: number): string {
  if (difference === 0) return "the drawer matches the ledger";
  return `${formatNPR(Math.abs(difference))} ${difference > 0 ? "over" : "short"}`;
}
