import type {
  AgingFilter,
  DueAgingBucket,
  FeeTab,
  InvoiceStatusValue,
  PaymentMethodValue,
  PaymentStatusValue,
} from "@/lib/validators/fees";

/**
 * View models for the fees module (docs 05). The enums, option lists and filters
 * live with their schemas in `src/lib/validators/fees.ts` because the admin tables
 * are client components; this module holds only the shapes the DAL returns and the
 * inputs it accepts.
 */

export type FeeFilters = {
  tab: FeeTab;
  q?: string;
  aging: AgingFilter;
  method?: PaymentMethodValue;
  status?: InvoiceStatusValue;
  courseId?: string;
  batchId?: string;
  day?: string;
  page: number;
};

/* ───────────────────────── rows ───────────────────────── */

export type InvoiceLine = {
  seq: number;
  amount: number;
  dueDate: string | null;
};

export type InvoiceRow = {
  id: string;
  number: string;
  title: string;
  status: InvoiceStatusValue;
  studentId: string;
  studentName: string;
  studentCode: string;
  courseTitle: string | null;
  batchName: string | null;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  balance: number;
  dueDate: string | null;
  createdAt: string;
};

export type DueRow = InvoiceRow & {
  /** Whole days past `dueDate` in Kathmandu time; null when undated. */
  daysOverdue: number | null;
  aging: DueAgingBucket;
  /** Earliest instalment not yet covered by what has been paid (docs 05 §2). */
  nextDueAmount: number | null;
  nextDueDate: string | null;
  counselorName: string | null;
};

export type PaymentRow = {
  id: string;
  receiptNo: string;
  amount: number;
  method: PaymentMethodValue;
  status: PaymentStatusValue;
  reference: string | null;
  receivedAt: string;
  receivedByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  invoiceId: string;
  invoiceNumber: string;
  studentName: string;
  studentCode: string;
};

export type PaginationMeta = {
  total: number;
  page: number;
  pageCount: number;
};

export type FeeListResult<T> = { rows: T[] } & PaginationMeta;

export type DuesSummary = {
  outstanding: number;
  overdueCount: number;
  overdueAmount: number;
  buckets: Record<DueAgingBucket, number>;
};

export type DayBookTotals = {
  day: string;
  count: number;
  total: number;
  /** What the receipts called "Cash" add up to — the number the drawer is checked against. */
  cash: number;
  byMethod: { method: PaymentMethodValue; label: string; count: number; amount: number }[];
  byReceiver: { name: string; count: number; amount: number }[];
};

/**
 * A counted, shut day (fix guide §2). `cashCounted` is what was actually in the
 * drawer, so the day book can show the difference instead of trusting itself.
 */
export type DayClosure = {
  day: string;
  cashCounted: number | null;
  note: string | null;
  closedByName: string | null;
  closedAt: string;
};

export type InvoiceDetail = InvoiceRow & {
  enrollmentId: string | null;
  discountReason: string | null;
  note: string | null;
  voidReason: string | null;
  createdByName: string | null;
  /** What the instalment schedule says is owed next; the dialog's default amount. */
  nextDueAmount: number | null;
  installments: InvoiceLine[];
  payments: PaymentRow[];
};

/** What a student sees of their own fees (docs 05 §5, student portal). */
export type StudentInvoiceSummary = {
  id: string;
  number: string;
  title: string;
  status: InvoiceStatusValue;
  netAmount: number;
  paidAmount: number;
  balance: number;
  dueDate: string | null;
  nextDueAmount: number | null;
  nextDueDate: string | null;
  receipts: {
    id: string;
    receiptNo: string;
    amount: number;
    method: PaymentMethodValue;
    receivedAt: string;
    status: PaymentStatusValue;
  }[];
};

/* ───────────────────────── write inputs ───────────────────────── */

export type InvoiceInstallmentInput = {
  seq: number;
  amount: number;
  /** Optional in the type only because a form field arrives as `string | undefined`;
   * `createInvoice` refuses a schedule row without one — the column is not nullable. */
  dueDate?: string | null;
};

export type CreateInvoiceInputData = {
  studentId: string;
  enrollmentId?: string | null;
  title: string;
  grossAmount: number;
  discountAmount: number;
  discountReason?: string | null;
  dueDate?: string | null;
  note?: string | null;
  installments: InvoiceInstallmentInput[];
};

export type RecordPaymentInputData = {
  invoiceId: string;
  amount: number;
  method: PaymentMethodValue;
  reference?: string | null;
  receivedAt?: string | null;
  /** Absent only for writes that did not come from the dialog, e.g. a gateway credit. */
  idempotencyKey?: string | null;
};
