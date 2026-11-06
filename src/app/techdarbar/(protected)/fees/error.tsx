"use client";
import { SegmentError } from "@/components/admin/SegmentError";

export default function FeesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError title="Fees" error={error} reset={reset} />;
}
