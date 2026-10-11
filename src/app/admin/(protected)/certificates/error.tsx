"use client";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CertificatesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[certificates] page error", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="rounded-full bg-destructive/10 p-4 text-destructive">
        <AlertTriangle className="size-8" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
        Certificates could not be loaded
      </h1>
      <p className="max-w-sm text-sm text-neutral-600">
        Something went wrong while loading certificate data. Try again — if the
        problem keeps happening, contact support.
      </p>
      <Button type="button" onClick={() => reset()}>
        <RefreshCw className="size-4" />
        Try again
      </Button>
    </div>
  );
}