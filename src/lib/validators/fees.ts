import { z } from "zod";
import type {
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/generated/prisma/client";
import { cuidLike, optionalDateString, pageParamSchema } from "./shared";

/**
 * Fees & payments schemas (docs 05). Admin-only, so — like `validators/certificates.ts`
 * — there is no `…Form` twin and no Turnstile token: the browser validates the same
 * object the Server Action re-parses.
 *
 * Client-safe: `src/components/admin/fees/*` imports this file, so the only Prisma
 * reference is a type import (erased at build), and the value lists below are
 * asserted against the generated enums in `tests/fees.test.ts` rather than derived
 * from them.
 */

export const INVOICE_STATUS_VALUES = [
  "DRAFT",
  "ISSUED",
  "PARTIAL",
  "PAID",
  "VOID",
] as const satisfies readonly InvoiceStatus[];

export type InvoiceStatusValue = (typeof INVOICE_STATUS_VALUES)[number];

export const PAYMENT_METHOD_VALUES = [
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "ESEWA",
  "KHALTI",
  "FONEPAY",
  "CONNECTIPS",
  "OTHER",
] as const satisfies readonly PaymentMethod[];

export type PaymentMethodValue = (typeof PAYMENT_METHOD_VALUES)[number];

export const PAYMENT_STATUS_VALUES = ["RECEIVED", "VOIDED"] as const satisfies readonly PaymentStatus[];
export type PaymentStatusValue = (typeof PAYMENT_STATUS_VALUES)[number];

export const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "ESEWA", label: "eSewa" },
  { value: "KHALTI", label: "Khalti" },
  { value: "FONEPAY", label: "Fonepay" },
  { value: "CONNECTIPS", label: "ConnectIPS" },
  { value: "OTHER", label: "Other" },
] as const satisfies readonly { value: PaymentMethodValue; label: string }[];

export function paymentMethodLabel(value: string): string {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** The invoice statuses that still count as money owed. */
export const OPEN_INVOICE_STATUSES: readonly InvoiceStatusValue[] = ["ISSUED", "PARTIAL"];

/* ───────────────────────── dues aging ───────────────────────── */

/**
 * docs 05 §5: the Dues tab shows aging chips 0-7, 8-30 and 30+ days. An invoice
 * with no due date is not "current", so it gets its own bucket instead of being
 * silently counted as not overdue.
 */
export const DUE_AGING_BUCKETS = [
  "CURRENT",
  "OVERDUE_1_7",
  "OVERDUE_8_30",
  "OVERDUE_30_PLUS",
  "UNDATED",
] as const;

export type DueAgingBucket = (typeof DUE_AGING_BUCKETS)[number];

export const AGING_FILTER_VALUES = ["all", ...DUE_AGING_BUCKETS] as const;
export type AgingFilter = (typeof AGING_FILTER_VALUES)[number];

export const AGING_OPTIONS = [
  { value: "all", label: "All dues" },
  { value: "CURRENT", label: "Not yet due" },
  { value: "OVERDUE_1_7", label: "1-7 days" },
  { value: "OVERDUE_8_30", label: "8-30 days" },
  { value: "OVERDUE_30_PLUS", label: "30+ days" },
  { value: "UNDATED", label: "No due date" },
] as const satisfies readonly { value: AgingFilter; label: string }[];

export function agingLabel(value: AgingFilter): string {
  return AGING_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/* ───────────────────────── tabs ───────────────────────── */

export const FEE_TABS = ["dues", "invoices", "payments"] as const;
export type FeeTab = (typeof FEE_TABS)[number];

/**
 * Amounts are whole NPR in a Postgres `Int`, never decimals. The ceiling is far
 * above any course fee but keeps the number inside the integer column and inside
 * the receipt's "amount in words" conversion.
 */
const MAX_NPR = 100_000_000;

const nprAmount = (label: string) =>
  z.coerce
    .number()
    .int(`${label} must be a whole rupee amount`)
    .min(0, `${label} cannot be negative`)
    .max(MAX_NPR, `${label} is too large`);

/** A payment must actually move money; an invoice total may legitimately be waived. */
const paymentAmountSchema = z.coerce
  .number()
  .int("Amount must be a whole rupee amount")
  .min(1, "Enter an amount of at least NPR 1")
  .max(MAX_NPR, "Amount is too large");

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (max ${max} characters)`)
    .nullish()
    .transform((value) => (value ? value : null));

const requiredText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long (max ${max} characters)`);

/** `""` from a `<select>` means "not set". */
const optionalCuid = z
  .union([cuidLike, z.literal(""), z.null()])
  .optional()
  .transform((value) => (typeof value === "string" && value ? value : null));

const reasonSchema = requiredText(500, "Reason");

/* ───────────────────────── invoice ───────────────────────── */

export const invoiceInstallmentSchema = z.object({
  seq: z.coerce.number().int().min(1).max(60, "Too many instalments"),
  amount: nprAmount("Instalment amount"),
  dueDate: optionalDateString,
});

const invoiceFields = {
  studentId: cuidLike,
  enrollmentId: optionalCuid,
  title: requiredText(160, "Invoice title"),
  grossAmount: nprAmount("Fee"),
  discountAmount: nprAmount("Discount").default(0),
  discountReason: optionalText(300, "Discount reason"),
  dueDate: optionalDateString,
  note: optionalText(500, "Note"),
  installments: z.array(invoiceInstallmentSchema).max(60).default([]),
};

/**
 * A draft invoice. `number` and `netAmount` are issued server-side, so the client
 * cannot propose them; the two arithmetic rules the database also enforces with a
 * CHECK constraint are checked here first so the form gets a field error.
 */
export const createInvoiceSchema = z
  .object(invoiceFields)
  .refine((value) => value.discountAmount <= value.grossAmount, {
    path: ["discountAmount"],
    message: "Discount cannot be more than the fee",
  })
  .superRefine((value, ctx) => {
    if (value.installments.length === 0) return;
    const net = value.grossAmount - value.discountAmount;
    const scheduled = value.installments.reduce((sum, row) => sum + row.amount, 0);
    if (scheduled !== net) {
      ctx.addIssue({
        code: "custom",
        path: ["installments"],
        message: `The schedule adds up to NPR ${scheduled.toLocaleString("en-IN")}, but the net fee is NPR ${net.toLocaleString("en-IN")}`,
      });
    }
    const seen = new Set<number>();
    for (const row of value.installments) {
      if (seen.has(row.seq)) {
        ctx.addIssue({
          code: "custom",
          path: ["installments"],
          message: `Instalment ${row.seq} is listed twice`,
        });
        break;
      }
      seen.add(row.seq);
      if (!row.dueDate) {
        ctx.addIssue({
          code: "custom",
          path: ["installments"],
          message: `Every instalment needs a due date (instalment ${row.seq} has none)`,
        });
      }
    }
  });

export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
export type CreateInvoiceValues = z.output<typeof createInvoiceSchema>;

export const invoiceIdSchema = z.object({ id: cuidLike });

export const voidInvoiceSchema = z.object({
  id: cuidLike,
  reason: reasonSchema,
});

/* ───────────────────────── payment ───────────────────────── */

/**
 * `receivedAt` is the date the money arrived, entered in campus time; empty means
 * "now". A future date is rejected here — there can be no receipt for money that
 * has not come in yet. How far *back* a receipt may go is not a form rule: it
 * depends on who is typing, so the Settings window is enforced in the action
 * (fix guide §2), and a closed day is refused by the DAL.
 *
 * `idempotencyKey` is minted by the dialog once per opening, not once per click, so
 * the second send of a double-click — or the resend after a lost response — is
 * recognised as the same attempt (fix guide §1). Without it the ledger would gain a
 * second receipt for one payment.
 */
/**
 * One slip has one spelling here.
 *
 * The index that stops a reference backing two live receipts compares the stored
 * string, so "TXN1", "txn1" and " txn1 " would each look like a new slip to it
 * while the clerk means the same piece of paper. Normalising on the way in —
 * before the DAL's own pre-check and before the row is written — is what makes
 * the read, the write and the partial unique index agree on one value.
 * `prisma/migrations/20261106090000_payment_reference_normalized` applies the same
 * rule to the rows that were stored before it.
 */
export function normalizePaymentReference(value: string | null | undefined): string | null {
  const collapsed = value?.replace(/\s+/g, " ").trim().toUpperCase();
  return collapsed ? collapsed : null;
}

export const recordPaymentSchema = z
  .object({
    invoiceId: cuidLike,
    amount: paymentAmountSchema,
    method: z.enum(PAYMENT_METHOD_VALUES, { error: "Choose how the fee was paid" }),
    reference: z
      .string()
      .trim()
      .max(120, "Reference is too long (max 120 characters)")
      .nullish()
      .transform((value) => normalizePaymentReference(value)),
    receivedAt: optionalDateString,
    idempotencyKey: z.uuid({ error: "Reload the page and record the payment again" }),
  })
  .refine(
    (value) =>
      !value.receivedAt ||
      new Date(`${value.receivedAt}T00:00:00+05:45`).getTime() <= Date.now(),
    { path: ["receivedAt"], message: "A payment cannot be dated in the future" }
  )
  // Fix guide §3: anything that came in on a slip has to carry that slip. The
  // partial unique index then stops one reference backing two live receipts, but
  // the index cannot say what the clerk should type — this can.
  .refine((value) => value.method === "CASH" || !!value.reference, {
    path: ["reference"],
    message: "Enter the slip or transaction reference",
  });

export const voidPaymentSchema = z.object({
  id: cuidLike,
  reason: reasonSchema,
});

export type RecordPaymentValues = z.output<typeof recordPaymentSchema>;

/* ───────────────────────── day close ───────────────────────── */

/** One campus day, written the way the day book prints it (fix guide §2). */
const dayKeySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-05");

/**
 * Close a day. `cashCounted` is what the drawer actually held: an empty field is
 * "not counted", not NPR 0, because the difference the page shows has to say so.
 */
export const closeDaySchema = z.object({
  day: dayKeySchema,
  cashCounted: z
    .union([z.literal(""), z.coerce.number().int().min(0, "Counted cash cannot be negative").max(MAX_NPR, "Counted cash is too large")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  note: optionalText(300, "Note"),
});

/** Reopening is the one action that lets money land in a day already handed over. */
export const reopenDaySchema = z.object({
  day: dayKeySchema,
  reason: reasonSchema,
});

export type CloseDayValues = z.output<typeof closeDaySchema>;

/* ───────────────────────── filters ───────────────────────── */

/**
 * One schema for the whole `/techdarbar/fees` screen; the tab decides which half is
 * read. Every field uses `.catch()` so a hand-edited query string falls back to the
 * default instead of throwing in the page.
 */
export const feeFilterSchema = z.object({
  tab: z.enum(FEE_TABS).catch("dues"),
  q: z.string().trim().max(120).optional().catch(undefined),
  aging: z.enum(AGING_FILTER_VALUES).catch("all"),
  status: z.enum(INVOICE_STATUS_VALUES).optional().catch(undefined),
  method: z.enum(PAYMENT_METHOD_VALUES).optional().catch(undefined),
  courseId: cuidLike.optional().catch(undefined),
  batchId: cuidLike.optional().catch(undefined),
  /** `YYYY-MM-DD` in Kathmandu, for the Payments tab and the day book. */
  day: dayKeySchema.optional().catch(undefined),
  page: pageParamSchema,
});

export type FeeFiltersParsed = z.infer<typeof feeFilterSchema>;

export const FEE_PAGE_SIZE = 25;

/** Discount above this share of the fee needs an ADMIN to issue it (docs 05 §2). */
export const DEFAULT_DISCOUNT_APPROVAL_THRESHOLD_PCT = 10;
