"use client";
import { SegmentError } from "@/components/admin/SegmentError";

export default function StudentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError title="Students" error={error} reset={reset} />;
}
