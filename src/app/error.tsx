"use client";

import * as React from "react";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { buttonVariants } from "@/components/ui/button";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // The digest is the only safe identifier to surface: the message can contain
    // server data. Server-side logs already hold the full stack.
    console.error("[app] unhandled error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex-1 flex items-center">
      <Container size="md" className="py-20 sm:py-28 text-center">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertTriangle className="size-10" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Something went wrong
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 text-balance">
          We couldn&apos;t load this page
        </h1>
        <p className="mt-4 text-base text-neutral-600 max-w-lg mx-auto leading-relaxed">
          The error has been logged. Try again — if it keeps happening, contact us and
          mention the reference below.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs font-mono text-neutral-500">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button type="button" onClick={reset} className={buttonVariants({ size: "lg" })}>
            <RotateCcw className="size-5" aria-hidden="true" />
            Try again
          </button>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Home className="size-5" aria-hidden="true" />
            Back to Home
          </Link>
        </div>
      </Container>
    </div>
  );
}
