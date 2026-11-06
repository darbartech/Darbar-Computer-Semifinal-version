"use client";
import { SegmentError } from "@/components/admin/SegmentError";

export default function CertificatesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError title="Certificates" error={error} reset={reset} />;
}
