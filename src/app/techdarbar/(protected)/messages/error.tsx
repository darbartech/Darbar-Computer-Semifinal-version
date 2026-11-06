"use client";
import { SegmentError } from "@/components/admin/SegmentError";

export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError title="Messages" error={error} reset={reset} />;
}
