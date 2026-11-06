"use client";
import { SegmentError } from "@/components/admin/SegmentError";

export default function UsersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError title="Staff accounts" error={error} reset={reset} />;
}
