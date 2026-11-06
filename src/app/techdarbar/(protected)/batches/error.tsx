"use client";
import { SegmentError } from "@/components/admin/SegmentError";

export default function BatchesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError title="Batches" error={error} reset={reset} />;
}
