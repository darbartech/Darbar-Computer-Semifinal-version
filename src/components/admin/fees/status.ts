import { fmtDate } from "@/lib/dates";
import type {
  DueAgingBucket,
  InvoiceStatusValue,
  PaymentStatusValue,
} from "@/lib/validators/fees";

/**
 * One source for the money badges and labels, so the Dues chips, the invoice
 * toolbar and the payments list can never call the same status three different
 * colours (same reason as `certificates/status.ts`).
 */

type BadgeVariant =
  | "default"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatusValue, BadgeVariant> = {
  DRAFT: "outline",
  ISSUED: "default",
  PARTIAL: "warning",
  PAID: "success",
  VOID: "destructive",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatusValue, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PARTIAL: "Partly paid",
  PAID: "Paid",
  VOID: "Void",
};

export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABELS[status as InvoiceStatusValue] ?? status;
}

export const PAYMENT_STATUS_VARIANT: Record<PaymentStatusValue, BadgeVariant> = {
  RECEIVED: "success",
  VOIDED: "destructive",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusValue, string> = {
  RECEIVED: "Received",
  VOIDED: "Voided",
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status as PaymentStatusValue] ?? status;
}

/**
 * Aging is deliberately a different colour from status: "8-30 days" describes how
 * late a bill is, not what kind of document it is, and an accountant scanning the
 * Dues tab reads the two separately.
 */
export const AGING_VARIANT: Record<DueAgingBucket, BadgeVariant> = {
  CURRENT: "outline",
  OVERDUE_1_7: "warning",
  OVERDUE_8_30: "destructive",
  OVERDUE_30_PLUS: "destructive",
  UNDATED: "secondary",
};

export const AGING_SHORT_LABELS: Record<DueAgingBucket, string> = {
  CURRENT: "Not due",
  OVERDUE_1_7: "1-7 d",
  OVERDUE_8_30: "8-30 d",
  OVERDUE_30_PLUS: "30+ d",
  UNDATED: "No date",
};

/** A `@db.Date` column that may be empty; `—` rather than an invented day. */
export function dateOrDash(value: string | null): string {
  return value ? fmtDate(value) : "—";
}
