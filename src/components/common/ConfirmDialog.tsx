"use client";
import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
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

/**
 * The one yes/no dialog for everything the admin area can regret (docs/08 §UX).
 *
 * `window.confirm()` was the previous answer and it is the wrong tool here: it is
 * styled by the browser, names nothing (the row's own words lived in a string
 * literal), cannot ask for a reason, and gives no place to show what the server
 * said back when the action failed — so a refused delete left no trace except a
 * toast the user may already have tabbed away from.
 *
 * The dialog owns focus: `DialogContent` moves focus in, restores it on close and
 * binds Escape, and the Tab handler below keeps the caret inside the panel while
 * it is open, so "press Enter to destroy this" cannot be answered by a stray
 * keystroke on the page behind it.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type ConfirmRequest = {
  title: string;
  description: React.ReactNode;
  /** Defaults to "Delete" for destructive requests, "Confirm" otherwise. */
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  /**
   * Asks for a reason and refuses to enable the button until one is typed — for
   * the writes whose reason belongs in the audit log.
   */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /**
   * Runs the action with the dialog still open, so the button cannot be pressed
   * twice and a failure stays on screen with a retry. Return the error message to
   * keep the dialog open, or `null` to close it.
   */
  run?: (reason: string) => Promise<string | null>;
};

export function ConfirmDialog({
  open,
  request,
  pending,
  error,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  request: ConfirmRequest;
  pending: boolean;
  error: string | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const destructive = (request.variant ?? "destructive") === "destructive";
  const confirmLabel =
    request.confirmLabel ?? (destructive ? "Delete" : "Confirm");
  const reasonMissing = Boolean(request.reasonLabel) && reason.trim().length === 0;

  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)
    ).filter((node) => node.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent
        className="sm:max-w-md"
        onKeyDown={trapTab}
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <DialogHeader>
          <DialogTitle id="confirm-dialog-title">{request.title}</DialogTitle>
          <DialogDescription id="confirm-dialog-description">
            {request.description}
          </DialogDescription>
        </DialogHeader>

        {request.reasonLabel && (
          <div className="px-6 pb-1">
            <Label htmlFor="confirm-dialog-reason" className="mb-1.5 block text-sm font-medium">
              {request.reasonLabel}
            </Label>
            <Textarea
              id="confirm-dialog-reason"
              rows={3}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={request.reasonPlaceholder}
              disabled={pending}
            />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mx-6 mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" type="button" onClick={onCancel} disabled={pending}>
            {request.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending || reasonMissing}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * State for one dialog at a time: a second `ask()` closes the first one as a
 * cancel rather than stacking two destructive questions on top of each other.
 *
 * `dialog` is always rendered and is a no-op while nothing was asked, so the host
 * only has to drop `{dialog}` into its JSX once.
 */
export function useConfirm() {
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const resolver = React.useRef<((confirmed: boolean) => void) | null>(null);

  const settle = React.useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setRequest(null);
    setReason("");
    setError(null);
    setPending(false);
  }, []);

  const ask = React.useCallback(
    (next: ConfirmRequest) => {
      // Whatever was open before is answered "no" rather than left hanging.
      settle(false);
      setRequest(next);
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
      });
    },
    [settle]
  );

  const confirm = () => {
    if (!request) return;
    if (!request.run) {
      settle(true);
      return;
    }
    setError(null);
    setPending(true);
    void request.run(request.reasonLabel ? reason.trim() : "").then(
      (message) => {
        setPending(false);
        // A failure keeps the dialog open with the message in it: the row the user
        // selected is still on screen and the answer is still worth reading.
        if (message) setError(message);
        else settle(true);
      },
      (caught: unknown) => {
        setPending(false);
        setError(
          caught instanceof Error ? caught.message : "Something went wrong. Please try again."
        );
      }
    );
  };

  const dialog = request ? (
    <ConfirmDialog
      open
      request={request}
      pending={pending}
      error={error}
      reason={reason}
      onReasonChange={setReason}
      onCancel={() => settle(false)}
      onConfirm={confirm}
    />
  ) : null;

  return { ask, dialog };
}
