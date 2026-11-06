"use client";
import { SegmentError } from "@/components/admin/SegmentError";

export default function AssignmentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError title="Assignments" error={error} reset={reset} />;
}
