import { startOfKathmanduDay } from "@/lib/format";
import {
  OPEN_INVOICE_STATUSES,
  type DueAgingBucket,
  type InvoiceStatusValue,
} from "@/lib/validators/fees";

/**
 * Fees domain rules (docs 05 §2), kept pure so they are unit-testable without a
 * database and cannot drift between the DAL, the actions and the reports.
 *
 * Two invariants run through all of them: the ledger is append-only, so a balance
 * is always *computed* from the RECEIVED payments and never stored; and a `VOID`
 * invoice is a dead document — it accepts no payments.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type PaidTotals = {
  /** Sum of payments with status RECEIVED. VOIDED money is not money. */
  received: number;
};

/** `balance(invoice) = netAmount − Σ payments(status=RECEIVED).amount`. */
export function invoiceBalance(netAmount: number, received: number): number {
  return netAmount - received;
}

/**
 * Status after money lands, computed the same way for a payment, a void and a
 * reconciliation: PAID at zero balance, PARTIAL between, ISSUED back at nothing
 * paid. A DRAFT was never billable and a VOID is finished, so both are left alone.
 */
export function nextInvoiceStatus(
  status: InvoiceStatusValue,
  netAmount: number,
  received: number
): InvoiceStatusValue {
  if (status === "DRAFT" || status === "VOID") return status;
  const balance = invoiceBalance(netAmount, received);
  if (balance <= 0) return "PAID";
  if (received > 0) return "PARTIAL";
  return "ISSUED";
}

/** Only an issued, settled-partially invoice may take money (docs 05 §2). */
export function isPayable(status: InvoiceStatusValue): boolean {
  return OPEN_INVOICE_STATUSES.includes(status);
}

/**
 * The most that can be paid without overpaying. A zero-fee invoice (a full
 * waiver) has no payable amount, so it stays a manual status change.
 */
export function payableAmount(netAmount: number, received: number): number {
  return Math.max(0, invoiceBalance(netAmount, received));
}

/* ───────────────────────── instalments ───────────────────────── */

export type InstallmentLike = {
  seq: number;
  amount: number;
  dueDate: Date | string | null;
};

/**
 * "Next due" is the earliest instalment whose cumulative amount is more than what
 * has been paid (docs 05 §2). Instalments are a schedule only: payments are
 * applied to the invoice, never to a specific instalment row.
 */
export function nextDueInstallment(
  installments: readonly InstallmentLike[],
  received: number
): { amount: number; dueDate: Date | null; seq: number } | null {
  // `seq` is unique per invoice (the create schema refuses a duplicate), so it is
  // already a complete order — no date tie-break needed.
  const ordered = [...installments].sort((a, b) => a.seq - b.seq);
  let cumulative = 0;
  for (const row of ordered) {
    cumulative += row.amount;
    if (cumulative > received) {
      return { amount: cumulative - received, dueDate: toDate(row.dueDate), seq: row.seq };
    }
  }
  return null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ───────────────────────── aging ───────────────────────── */

export type Aging = {
  daysOverdue: number | null;
  bucket: DueAgingBucket;
};

/**
 * Days past the due date, counted in campus calendar days (a fee due on the 4th
 * is one day late at any point on the 5th, not after 24 hours). An invoice with
 * no due date is `UNDATED`, not "current": it is a bill nobody set a deadline for.
 */
export function agingOf(dueDate: Date | string | null | undefined, now: Date = new Date()): Aging {
  const due = toDate(dueDate);
  if (!due) return { daysOverdue: null, bucket: "UNDATED" };
  const days = Math.round(
    (startOfKathmanduDay(now).getTime() - startOfKathmanduDay(due).getTime()) / DAY_MS
  );
  if (days <= 0) return { daysOverdue: 0, bucket: "CURRENT" };
  if (days <= 7) return { daysOverdue: days, bucket: "OVERDUE_1_7" };
  if (days <= 30) return { daysOverdue: days, bucket: "OVERDUE_8_30" };
  return { daysOverdue: days, bucket: "OVERDUE_30_PLUS" };
}

/** The buckets shown as chips on the Dues tab, pre-seeded so the UI never gaps. */
export function emptyAgingCounts(): Record<DueAgingBucket, number> {
  return {
    CURRENT: 0,
    OVERDUE_1_7: 0,
    OVERDUE_8_30: 0,
    OVERDUE_30_PLUS: 0,
    UNDATED: 0,
  };
}

/* ───────────────────────── discounts ───────────────────────── */

/**
 * docs 05 §2: a discount above the configured share of the fee needs an ADMIN to
 * issue it. The maker stays able to save the draft; the gate is on issuing, which
 * is the moment it becomes a bill.
 */
export function discountPercent(grossAmount: number, discountAmount: number): number {
  if (grossAmount <= 0) return 0;
  return (discountAmount / grossAmount) * 100;
}

export function needsDiscountApproval(
  grossAmount: number,
  discountAmount: number,
  thresholdPercent: number
): boolean {
  if (discountAmount <= 0) return false;
  return discountPercent(grossAmount, discountAmount) > thresholdPercent;
}

export function netInvoiceAmount(grossAmount: number, discountAmount: number): number {
  return grossAmount - discountAmount;
}

/* ───────────────────────── money in words ───────────────────────── */

/**
 * Whole-number guard for money coming from a form: `z.coerce.number()` accepts
 * `1e309` as `Infinity`, and `Math.round(NaN)` is `NaN`, so both are refused here
 * before anything is multiplied, stored or printed on a receipt.
 */
export function toWholeNpr(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : (value as number);
  if (typeof number !== "number" || !Number.isFinite(number) || !Number.isSafeInteger(number)) {
    return null;
  }
  return number < 0 ? null : number;
}
