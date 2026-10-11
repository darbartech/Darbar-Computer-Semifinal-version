import type { CertificateStatusValue } from "@/server/types/certificates";

/**
 * Shared presentation helpers for certificate statuses. Kept in one place so the
 * list table, detail toolbar, record overview and preview panel can never drift:
 * one source for the badge colour and the human-readable label.
 */
export const STATUS_VARIANT: Record<
  CertificateStatusValue,
  "default" | "accent" | "success" | "outline" | "destructive" | "warning"
> = {
  DRAFT: "outline",
  PENDING_ISSUE: "accent",
  ISSUED: "success",
  REVOKED: "destructive",
  REISSUED: "warning",
  EXPIRED: "outline",
};

export const STATUS_LABELS: Record<CertificateStatusValue, string> = {
  DRAFT: "Draft",
  PENDING_ISSUE: "Pending Issue",
  ISSUED: "Issued",
  REVOKED: "Revoked",
  REISSUED: "Reissued",
  EXPIRED: "Expired",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as CertificateStatusValue] ?? status;
}