"use client";
import { SegmentError } from "@/components/admin/SegmentError";

export default function AuditLogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError title="The audit log" error={error} reset={reset} />;
}
