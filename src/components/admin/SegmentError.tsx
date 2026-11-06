"use client";
import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One failure screen for the admin segments and the student portal.
 *
 * Nothing from the error itself reaches the page: `error.message` can quote a
 * query or a row, and `stack` is the whole file tree. The digest is the only
 * useful thing to show — it is what the server log is keyed by, so the number in
 * front of the user and the line in the log are the same event.
 */
export function SegmentError({
  title,
  error,
  reset,
}: {
  title: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(`[${title.toLowerCase()}] segment error`, error.digest ?? error.message);
  }, [error, title]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-6 py-20 text-center">
      <div className="rounded-full bg-destructive/10 p-4 text-destructive">
        <AlertTriangle className="size-8" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
        {title} could not be loaded
      </h2>
      <p className="max-w-md text-sm text-neutral-600">
        The problem is logged. Try again — if it keeps happening, tell the technical
        contact and mention the reference below.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-neutral-500">Reference: {error.digest}</p>
      )}
      <Button type="button" onClick={() => reset()} className="mt-2">
        <RotateCcw className="size-4" aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}
