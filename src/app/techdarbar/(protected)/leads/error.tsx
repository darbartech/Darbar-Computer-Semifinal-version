"use client";
import { SegmentError } from "@/components/admin/SegmentError";

export default function LeadsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError title="Leads" error={error} reset={reset} />;
}
