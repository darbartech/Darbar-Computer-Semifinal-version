import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { InvoiceStatus, PaymentMethod } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { ADMIN_PICKER_LIMIT } from "@/server/constants";
import { kathmanduDayRange, dateOnlyValue, parseDateOnly } from "@/lib/dates";
import { kathmanduDayKey } from "@/lib/format";
import {
  paymentMethodLabel,
  normalizePaymentReference,
  FEE_PAGE_SIZE,
  type DueAgingBucket,
  type FeeFiltersParsed,
  type PaymentStatusValue,
} from "@/lib/validators/fees";
import {
  agingOf,
  emptyAgingCounts,
  invoiceBalance,
  nextDueInstallment,
  nextInvoiceStatus,
} from "@/server/services/fees";
import { generateInvoiceNumber, generateReceiptNumber } from "@/server/fees/numbers";
import { isP2002 } from "@/server/dal/counters";
import type {
  CreateInvoiceInputData,
  DayBookTotals,
  DayClosure,
  DueRow,
  DuesSummary,
  FeeListResult,
  InvoiceDetail,
  InvoiceRow,
  PaymentRow,
  RecordPaymentInputData,
  StudentInvoiceSummary,
} from "@/server/types/fees";

/**
 * Fees & payments data access (docs 05). Reads return ISO strings so the view
 * models cross the server/client boundary without `Date`s; every write is a
 * transaction that recomputes the balance instead of trusting a submitted one.
 *
 * Admin reads are deliberately uncached, matching `dal/leads.ts`: a balance has to
 * be the one from this instant, and read-your-own-writes already comes from
 * `invalidate()` in the actions.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/* ───────────────────────── shared shapes ───────────────────────── */

const invoiceScalars = {
  id: true,
  number: true,
  title: true,
  status: true,
  grossAmount: true,
  discountAmount: true,
  netAmount: true,
  dueDate: true,
  createdAt: true,
  studentId: true,
  enrollmentId: true,
  discountReason: true,
  note: true,
  voidReason: true,
} as const;

/**
 * Balances only ever count RECEIVED money, so `status` travels with the amount:
 * a detail select lists every receipt, voided ones included, and the total still
 * has to ignore them.
 */
const receivedPayments = {
  payments: { where: { status: "RECEIVED" }, select: { amount: true, status: true } },
} as const;

/** `StudentProfile` carries no name — the person is the `User` behind it. */
const studentLite = {
  student: { select: { studentCode: true, user: { select: { name: true } } } },
} as const;

const enrollmentLite = {
  enrollment: {
    select: { course: { select: { title: true } }, batch: { select: { name: true } } },
  },
} as const;

const invoiceRowSelect = {
  ...invoiceScalars,
  ...studentLite,
  ...enrollmentLite,
  ...receivedPayments,
} satisfies Prisma.InvoiceSelect;

const installmentSelect = {
  installments: {
    orderBy: { seq: "asc" as const },
    select: { seq: true, amount: true, dueDate: true },
  },
} as const;

const paymentRowSelect = {
  id: true,
  receiptNo: true,
  amount: true,
  method: true,
  status: true,
  reference: true,
  receivedAt: true,
  voidedAt: true,
  voidReason: true,
  receivedBy: { select: { name: true } },
  invoice: {
    select: {
      id: true,
      number: true,
      ...studentLite,
    },
  },
} satisfies Prisma.PaymentSelect;

type StudentRef = { studentCode: string; user: { name: string } };

/** The receipts of one invoice, voided ones included — the ledger shows its own edits. */
const invoicePaymentSelect = {
  id: true,
  receiptNo: true,
  amount: true,
  method: true,
  status: true,
  reference: true,
  receivedAt: true,
  voidedAt: true,
  voidReason: true,
  receivedBy: { select: { name: true } },
} satisfies Prisma.PaymentSelect;

type InvoiceFields = {
  id: string;
  number: string;
  title: string;
  status: InvoiceStatus;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  dueDate: Date | null;
  createdAt: Date;
  studentId: string;
  student: StudentRef;
  enrollment: { course: { title: string }; batch: { name: string } | null } | null;
  payments: { amount: number; status: PaymentStatusValue }[];
};

type PaymentFields = {
  id: string;
  receiptNo: string;
  amount: number;
  method: PaymentMethod;
  status: "RECEIVED" | "VOIDED";
  reference: string | null;
  receivedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  receivedBy: { name: string } | null;
};

function receivedTotal(row: InvoiceFields): number {
  return row.payments.reduce(
    (sum, payment) => (payment.status === "RECEIVED" ? sum + payment.amount : sum),
    0
  );
}

function toInvoiceRow(row: InvoiceFields): InvoiceRow {
  const paid = receivedTotal(row);
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    studentId: row.studentId,
    studentName: row.student.user.name,
    studentCode: row.student.studentCode,
    courseTitle: row.enrollment?.course.title ?? null,
    batchName: row.enrollment?.batch?.name ?? null,
    grossAmount: row.grossAmount,
    discountAmount: row.discountAmount,
    netAmount: row.netAmount,
    paidAmount: paid,
    balance: invoiceBalance(row.netAmount, paid),
    dueDate: row.dueDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** A receipt listed under its invoice, so no extra invoice hop per payment. */
function toInvoicePaymentRow(
  row: PaymentFields,
  invoice: { id: string; number: string; studentName: string; studentCode: string }
): PaymentRow {
  return {
    id: row.id,
    receiptNo: row.receiptNo,
    amount: row.amount,
    method: row.method,
    status: row.status,
    reference: row.reference,
    receivedAt: row.receivedAt.toISOString(),
    receivedByName: row.receivedBy?.name ?? null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    studentName: invoice.studentName,
    studentCode: invoice.studentCode,
  };
}

function toPaymentRow(row: PaymentFields & {
  invoice: { id: string; number: string; student: StudentRef };
}): PaymentRow {
  return toInvoicePaymentRow(row, {
    id: row.invoice.id,
    number: row.invoice.number,
    studentName: row.invoice.student.user.name,
    studentCode: row.invoice.student.studentCode,
  });
}

/* ───────────────────────── filters ───────────────────────── */

/**
 * A `@db.Date` column always lands on UTC midnight, so day boundaries are built
 * from the Kathmandu day key with the same day arithmetic `agingOf()` uses.
 * Comparing those dates against a Kathmandu midnight *instant* would drift by
 * 5:45 and file a fee due today as overdue.
 */
function dayUtc(dayKey: string, offsetDays = 0): Date {
  const fallback = new Date();
  const base = parseDateOnly(dayKey) ?? fallback;
  return new Date(base.getTime() - offsetDays * DAY_MS);
}

/**
 * The same boundary as `dayUtc()`, written as the `YYYY-MM-DD` text a raw
 * `::date` comparison wants — the raw driver hands a `Date` parameter a
 * timezone-dependent representation, a day key does not.
 */
function dayKeyUtc(dayKey: string, offsetDays: number): string {
  return dayUtc(dayKey, offsetDays).toISOString().slice(0, 10);
}

function agingWhere(
  aging: FeeFiltersParsed["aging"],
  now: Date
): Prisma.InvoiceWhereInput {
  if (aging === "all") return {};
  if (aging === "UNDATED") return { dueDate: null };
  const today = kathmanduDayKey(now);
  const start = dayUtc(today);
  switch (aging) {
    case "CURRENT":
      return { dueDate: { gte: start } };
    case "OVERDUE_1_7":
      return { dueDate: { gte: dayUtc(today, 7), lt: start } };
    case "OVERDUE_8_30":
      return { dueDate: { gte: dayUtc(today, 30), lt: dayUtc(today, 7) } };
    case "OVERDUE_30_PLUS":
      return { dueDate: { lt: dayUtc(today, 30) } };
    default:
      return {};
  }
}

/** Course/batch filters reach an invoice through its enrollment. */
function enrollmentFilter(
  filters: FeeFiltersParsed
): Prisma.EnrollmentWhereInput | null {
  if (!filters.courseId && !filters.batchId) return null;
  return {
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.batchId ? { batchId: filters.batchId } : {}),
  };
}

function studentSearch(q: string | undefined): Prisma.InvoiceWhereInput {
  if (!q) return {};
  return {
    OR: [
      { number: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { student: { user: { name: { contains: q, mode: "insensitive" } } } },
      { student: { studentCode: { contains: q, mode: "insensitive" } } },
    ],
  };
}

/** Everything still owed. A `DRAFT` is not a bill yet and a `VOID` is dead. */
const OPEN_DUE_STATUSES = ["ISSUED", "PARTIAL"] as const satisfies readonly InvoiceStatus[];
const OPEN_DUES: Prisma.InvoiceWhereInput = { status: { in: [...OPEN_DUE_STATUSES] } };

function duesWhere(filters: FeeFiltersParsed, now: Date): Prisma.InvoiceWhereInput {
  const enrollment = enrollmentFilter(filters);
  return {
    AND: [
      OPEN_DUES,
      agingWhere(filters.aging, now),
      enrollment ? { enrollment } : {},
      studentSearch(filters.q),
    ],
  };
}

function paging(
  filters: FeeFiltersParsed,
  total: number
): { page: number; pageCount: number; skip: number } {
  const pageCount = Math.max(1, Math.ceil(total / FEE_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pageCount);
  return { page, pageCount, skip: (page - 1) * FEE_PAGE_SIZE };
}

/* ───────────────────────── dues ───────────────────────── */

const duesRowSelect = {
  ...invoiceScalars,
  student: {
    select: {
      studentCode: true,
      user: { select: { name: true } },
      /** The counselor who sold the course (docs 05 §5) travels with the lead. */
      lead: { select: { assignedTo: { select: { name: true } } } },
    },
  },
  ...enrollmentLite,
  ...receivedPayments,
  ...installmentSelect,
} satisfies Prisma.InvoiceSelect;

/**
 * Dues tab: everything still owed, overdue first, oldest debt on top (docs 05 §5).
 * `nextDueAmount` comes from the instalment schedule so the record-payment dialog
 * can default to the figure the student actually owes next.
 */
export async function listDues(
  filters: FeeFiltersParsed,
  now: Date = new Date()
): Promise<FeeListResult<DueRow> & { summary: DuesSummary }> {
  const where = duesWhere(filters, now);
  const total = await db.invoice.count({ where });
  const { page, pageCount, skip } = paging(filters, total);

  const rows = await db.invoice.findMany({
    where,
    // Undated bills sort last instead of pretending to be due in 1970.
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    skip,
    take: FEE_PAGE_SIZE,
    select: duesRowSelect,
  });

  return {
    rows: rows.map((row) => {
      const base = toInvoiceRow(row);
      const aging = agingOf(row.dueDate, now);
      const next = nextDueInstallment(row.installments, base.paidAmount);
      return {
        ...base,
        daysOverdue: aging.daysOverdue,
        aging: aging.bucket,
        nextDueAmount: next ? next.amount : base.balance > 0 ? base.balance : null,
        nextDueDate: next?.dueDate?.toISOString() ?? base.dueDate,
        counselorName: row.student.lead?.assignedTo?.name ?? null,
      } satisfies DueRow;
    }),
    total,
    page,
    pageCount,
    summary: await getDuesSummary(now),
  };
}

/**
 * Aging counts over *every* open bill, not the current page: the chips have to
 * stay honest while the list itself is filtered.
 *
 * The counting happens in PostgreSQL. The version this replaces pulled every
 * open invoice *and every receipt against it* into Node and looped over it, so
 * the memory and the round trip grew with the size of the ledger — a dues tab
 * that stays at 25 rows on screen was reading the whole unpaid book, receipt by
 * receipt, on every page view and every filter change.
 *
 * The bucket boundaries are the same `dayUtc(today, n)` values `agingWhere()`
 * uses for the filtered list, passed in as `YYYY-MM-DD` text and cast in SQL.
 * Strings rather than `Date`s because the pg driver renders a zone-less
 * timestamp in the *server's* timezone, which would slide every chip's count by
 * a day on a box that is not on campus time (see `dal/dashboard.ts`).
 */
export function duesAgingQuery(
  today: string,
  weekAgo: string,
  monthAgo: string,
  openStatuses: readonly string[]
): Prisma.Sql {
  return Prisma.sql`
    WITH received AS (
      SELECT "invoiceId", sum("amount") AS amount
      FROM "Payment"
      WHERE status = 'RECEIVED'
      GROUP BY "invoiceId"
    )
    SELECT
      CASE
        WHEN i."dueDate" IS NULL THEN 'UNDATED'
        WHEN i."dueDate" >= ${today}::date THEN 'CURRENT'
        WHEN i."dueDate" >= ${weekAgo}::date THEN 'OVERDUE_1_7'
        WHEN i."dueDate" >= ${monthAgo}::date THEN 'OVERDUE_8_30'
        ELSE 'OVERDUE_30_PLUS'
      END AS bucket,
      count(*)::int AS count,
      coalesce(sum(i."netAmount" - coalesce(received.amount, 0)), 0)::bigint AS balance
    FROM "Invoice" i
    LEFT JOIN received ON received."invoiceId" = i.id
    WHERE i.status IN (${Prisma.join(openStatuses)})
    GROUP BY 1
  `;
}

export async function getDuesSummary(now: Date = new Date()): Promise<DuesSummary> {
  const today = kathmanduDayKey(now);
  const rows = await db.$queryRaw<{ bucket: DueAgingBucket; count: number; balance: bigint }[]>(
    duesAgingQuery(
      today,
      dayKeyUtc(today, 7),
      dayKeyUtc(today, 30),
      OPEN_DUE_STATUSES
    )
  );

  const buckets = emptyAgingCounts();
  let outstanding = 0;
  let overdueCount = 0;
  let overdueAmount = 0;

  for (const row of rows) {
    // A `::bigint` column arrives as a JS BigInt; money is integer NPR throughout.
    const balance = Number(row.balance);
    buckets[row.bucket] += row.count;
    outstanding += balance;
    if (row.bucket !== "CURRENT" && row.bucket !== "UNDATED") {
      overdueCount += row.count;
      overdueAmount += balance;
    }
  }

  return { outstanding, overdueCount, overdueAmount, buckets };
}

/** Sidebar badge and the accountant landing headline: how many bills are unpaid. */
export async function countOpenDues(): Promise<number> {
  return db.invoice.count({ where: OPEN_DUES });
}

/* ───────────────────────── invoices ───────────────────────── */

function invoicesWhere(filters: FeeFiltersParsed): Prisma.InvoiceWhereInput {
  const enrollment = enrollmentFilter(filters);
  return {
    AND: [
      filters.status ? { status: filters.status } : {},
      enrollment ? { enrollment } : {},
      studentSearch(filters.q),
    ],
  };
}

export async function listInvoices(
  filters: FeeFiltersParsed
): Promise<FeeListResult<InvoiceRow>> {
  const where = invoicesWhere(filters);
  const total = await db.invoice.count({ where });
  const { page, pageCount, skip } = paging(filters, total);

  const rows = await db.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take: FEE_PAGE_SIZE,
    select: invoiceRowSelect,
  });

  return { rows: rows.map(toInvoiceRow), total, page, pageCount };
}

/* ───────────────────────── payments ───────────────────────── */

/**
 * One Kathmandu calendar day as the UTC interval its receipts fall inside. The
 * filter value and the stored `receivedAt` have to agree on which midnight the
 * day starts at, or the day book loses the morning's counter cash.
 */
function dayRange(day: string | undefined): { gte: Date; lt: Date } | null {
  return day ? kathmanduDayRange(day) : null;
}

function paymentsWhere(filters: FeeFiltersParsed): Prisma.PaymentWhereInput {
  const range = dayRange(filters.day);
  const enrollment = enrollmentFilter(filters);
  const q = filters.q;
  return {
    AND: [
      filters.method ? { method: filters.method } : {},
      range ? { receivedAt: range } : {},
      enrollment ? { invoice: { enrollment } } : {},
      q
        ? {
            OR: [
              { receiptNo: { contains: q, mode: "insensitive" } },
              { reference: { contains: q, mode: "insensitive" } },
              { invoice: { number: { contains: q, mode: "insensitive" } } },
              { invoice: { student: { user: { name: { contains: q, mode: "insensitive" } } } } },
              { invoice: { student: { studentCode: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {},
    ],
  };
}

export async function listPayments(
  filters: FeeFiltersParsed
): Promise<FeeListResult<PaymentRow>> {
  const where = paymentsWhere(filters);
  const total = await db.payment.count({ where });
  const { page, pageCount, skip } = paging(filters, total);

  const rows = await db.payment.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    skip,
    take: FEE_PAGE_SIZE,
    select: paymentRowSelect,
  });

  return { rows: rows.map(toPaymentRow), total, page, pageCount };
}

/* ───────────────────────── invoice detail ───────────────────────── */

const invoiceDetailSelect = {
  ...invoiceRowSelect,
  createdBy: { select: { name: true } },
  ...installmentSelect,
  // `invoiceRowSelect` only fetched the amounts needed for the balance; the detail
  // page lists every receipt, including the voided ones.
  payments: { orderBy: { receivedAt: "desc" as const }, select: invoicePaymentSelect },
} satisfies Prisma.InvoiceSelect;

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  const row = await db.invoice.findFirst({ where: { id }, select: invoiceDetailSelect });
  if (!row) return null;

  const base = toInvoiceRow(row);
  const invoiceInfo = {
    id: row.id,
    number: row.number,
    studentName: row.student.user.name,
    studentCode: row.student.studentCode,
  };
  return {
    ...base,
    enrollmentId: row.enrollmentId,
    discountReason: row.discountReason,
    note: row.note,
    voidReason: row.voidReason,
    createdByName: row.createdBy?.name ?? null,
    nextDueAmount:
      base.balance > 0 ? (nextDueInstallment(row.installments, base.paidAmount)?.amount ?? base.balance) : null,
    installments: row.installments.map((item) => ({
      seq: item.seq,
      amount: item.amount,
      dueDate: item.dueDate?.toISOString() ?? null,
    })),
    payments: row.payments.map((payment) => toInvoicePaymentRow(payment, invoiceInfo)),
  };
}

/* ───────────────────────── day book ───────────────────────── */

const dayClosureSelect = {
  day: true,
  cashCounted: true,
  note: true,
  createdAt: true,
  closedBy: { select: { name: true } },
} satisfies Prisma.DayCloseSelect;

type DayClosureRow = Prisma.DayCloseGetPayload<{ select: typeof dayClosureSelect }>;

function toDayClosure(row: DayClosureRow): DayClosure {
  return {
    // A `@db.Date` comes back as UTC midnight, so its own ISO date is the key.
    day: dateOnlyValue(row.day) ?? row.day.toISOString().slice(0, 10),
    cashCounted: row.cashCounted,
    note: row.note,
    closedByName: row.closedBy?.name ?? null,
    closedAt: row.createdAt.toISOString(),
  };
}

/**
 * Cash book for one campus day (docs 05 §5): totals per method and per clerk.
 * VOIDED receipts are left out of the totals but stay in the list — a void is
 * part of the day's story and the ledger never rewrites it away.
 *
 * `closure` is the day's close record when it has been counted and shut
 * (fix guide §2); the page uses it to lock its own buttons and to show the
 * counted cash against the system total.
 */
export async function getDayBook(
  day: string = kathmanduDayKey()
): Promise<{ totals: DayBookTotals; rows: PaymentRow[]; closure: DayClosure | null }> {
  const range = dayRange(day) ?? { gte: new Date(0), lt: new Date(0) };
  const closedOn = dayColumn(day);
  const [rows, closureRow] = await Promise.all([
    db.payment.findMany({
      where: { receivedAt: range },
      orderBy: { receivedAt: "asc" },
      take: 500,
      select: paymentRowSelect,
    }),
    closedOn
      ? db.dayClose.findUnique({ where: { day: closedOn }, select: dayClosureSelect })
      : Promise.resolve(null),
  ]);

  const received = rows.filter((row) => row.status === "RECEIVED");
  const byMethod = new Map<PaymentMethod, { count: number; amount: number }>();
  const byReceiver = new Map<string, { count: number; amount: number }>();

  for (const row of received) {
    const method = byMethod.get(row.method) ?? { count: 0, amount: 0 };
    method.count += 1;
    method.amount += row.amount;
    byMethod.set(row.method, method);

    const name = row.receivedBy?.name ?? "Unknown";
    const clerk = byReceiver.get(name) ?? { count: 0, amount: 0 };
    clerk.count += 1;
    clerk.amount += row.amount;
    byReceiver.set(name, clerk);
  }

  return {
    totals: {
      day,
      count: received.length,
      total: received.reduce((sum, row) => sum + row.amount, 0),
      cash: received
        .filter((row) => row.method === "CASH")
        .reduce((sum, row) => sum + row.amount, 0),
      byMethod: [...byMethod.entries()].map(([method, value]) => ({
        method,
        label: paymentMethodLabel(method),
        ...value,
      })),
      byReceiver: [...byReceiver.entries()]
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => b.amount - a.amount),
    },
    rows: rows.map(toPaymentRow),
    closure: closureRow ? toDayClosure(closureRow) : null,
  };
}

export type DayCloseWriteResult =
  | {
      ok: true;
      id: string;
      day: string;
      cashCounted: number | null;
      cashSystem: number;
      difference: number | null;
    }
  | { ok: false; error: string };

/**
 * Count the drawer and shut one campus day (fix guide §2).
 *
 * The counted figure is optional — a day can be closed on the system total alone —
 * but `difference` is always recomputed from the receipts that are still live, so
 * the number the clerk is signing for is the one the ledger holds at this instant.
 * A day that is already closed is refused rather than overwritten: re-counting a
 * shut day is what reopening is for.
 */
export async function closeDay(
  input: { day: string; cashCounted: number | null; note: string | null },
  userId: string
): Promise<DayCloseWriteResult> {
  const day = dayColumn(input.day);
  const range = dayRange(input.day);
  if (!day || !range) return { ok: false, error: "Use a date like 2026-11-05" };

  return db.$transaction(async (tx) => {
    // Hold the day while the drawer is counted and the record written, so a
    // receipt cannot arrive between the two (fix guide §2).
    await lockDay(tx, day);

    const already = await tx.dayClose.findUnique({ where: { day }, select: { id: true } });
    if (already) return { ok: false, error: "That day is already closed." };

    const cash = await tx.payment.aggregate({
      where: { receivedAt: range, method: "CASH", status: "RECEIVED" },
      _sum: { amount: true },
    });
    const cashSystem = cash._sum.amount ?? 0;

    const created = await tx.dayClose.create({
      data: {
        day,
        cashCounted: input.cashCounted,
        note: input.note,
        closedById: userId,
      },
      select: { id: true },
    });

    return {
      ok: true,
      id: created.id,
      day: input.day,
      cashCounted: input.cashCounted,
      cashSystem,
      difference: input.cashCounted === null ? null : input.cashCounted - cashSystem,
    };
  });
}

/**
 * Reopen a closed day (fix guide §2). The close row is the only thing removed —
 * every receipt written that day stays, and the audit entry says who opened it
 * again, because that is the moment the day stopped being trustworthy.
 *
 * The delete happens under the day's advisory lock, so it cannot slip in front of
 * a receipt that was already being written against the closed day: either that
 * receipt is in the count returned here, or it arrives after the day is open.
 */
export async function reopenDay(
  day: string
): Promise<{ ok: true; receipts: number } | { ok: false; error: string }> {
  const column = dayColumn(day);
  const range = dayRange(day);
  if (!column || !range) return { ok: false, error: "Use a date like 2026-11-05" };

  return db.$transaction(async (tx) => {
    await lockDay(tx, column);

    const removed = await tx.dayClose.deleteMany({ where: { day: column } });
    if (removed.count === 0) return { ok: false, error: "That day is not closed." };

    const receipts = await tx.payment.count({ where: { receivedAt: range } });
    return { ok: true, receipts };
  });
}

/* ───────────────────────── student portal ───────────────────────── */

const studentInvoiceSelect = {
  ...invoiceScalars,
  ...studentLite,
  ...enrollmentLite,
  ...receivedPayments,
  ...installmentSelect,
  payments: {
    orderBy: { receivedAt: "desc" as const },
    select: {
      id: true,
      receiptNo: true,
      amount: true,
      method: true,
      receivedAt: true,
      status: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

/**
 * "My fees" for the student portal (docs 05 §5). A DRAFT is an internal working
 * document and never appears here — except to staff on the student's own screen,
 * who are the ones that drafted it and still have to issue it.
 */
export async function getStudentFeeSummaries(
  studentProfileId: string,
  opts: { includeDrafts?: boolean } = {}
): Promise<StudentInvoiceSummary[]> {
  const rows = await db.invoice.findMany({
    where: {
      studentId: studentProfileId,
      ...(opts.includeDrafts ? {} : { NOT: { status: "DRAFT" } }),
    },
    orderBy: { createdAt: "desc" },
    select: studentInvoiceSelect,
  });

  return rows.map((row) => {
    const base = toInvoiceRow(row);
    const next = nextDueInstallment(row.installments, base.paidAmount);
    const stillOwes = base.status === "ISSUED" || base.status === "PARTIAL";
    return {
      id: base.id,
      number: base.number,
      title: base.title,
      status: base.status,
      netAmount: base.netAmount,
      paidAmount: base.paidAmount,
      balance: base.balance,
      dueDate: base.dueDate,
      nextDueAmount: stillOwes ? (next?.amount ?? base.balance) : null,
      nextDueDate: stillOwes ? (next?.dueDate?.toISOString() ?? base.dueDate) : null,
      receipts: row.payments.map((payment) => ({
        id: payment.id,
        receiptNo: payment.receiptNo,
        amount: payment.amount,
        method: payment.method,
        receivedAt: payment.receivedAt.toISOString(),
        status: payment.status,
      })),
    } satisfies StudentInvoiceSummary;
  });
}

/** The student's own enrollments, to pre-fill a new invoice. */
export async function listBillableEnrollments(studentId: string): Promise<
  { id: string; courseTitle: string; batchName: string | null; feeNPR: number }[]
> {
  const rows = await db.enrollment.findMany({
    where: { studentId, status: { in: ["ACTIVE", "COMPLETED"] } },
    orderBy: { enrolledAt: "desc" },
    select: {
      id: true,
      course: { select: { title: true, feeNPR: true } },
      batch: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    courseTitle: row.course.title,
    batchName: row.batch?.name ?? null,
    feeNPR: row.course.feeNPR,
  }));
}

export async function listFeeFilterOptions(): Promise<{
  courses: { id: string; title: string }[];
  batches: { id: string; name: string; courseTitle: string }[];
}> {
  const [courses, batches] = await Promise.all([
    db.course.findMany({
      orderBy: { title: "asc" },
      take: ADMIN_PICKER_LIMIT,
      select: { id: true, title: true },
    }),
    db.batch.findMany({
      orderBy: { startDate: "desc" },
      take: ADMIN_PICKER_LIMIT,
      select: { id: true, name: true, course: { select: { title: true } } },
    }),
  ]);
  return {
    courses,
    batches: batches.map((batch) => ({
      id: batch.id,
      name: batch.name,
      courseTitle: batch.course.title,
    })),
  };
}

/** One-row lookup for the new-invoice dialog (student must exist and be approved). */
export async function getInvoiceTargetStudent(studentId: string) {
  return db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      studentCode: true,
      approvalStatus: true,
      user: { select: { name: true, isActive: true } },
    },
  });
}

/* ───────────────────────── writes ───────────────────────── */

/** Amounts the discount-approval gate (docs 05 §2) reads before issuing. */
export async function getInvoiceAmounts(id: string): Promise<{
  grossAmount: number;
  discountAmount: number;
  status: InvoiceStatus;
} | null> {
  return db.invoice.findUnique({
    where: { id },
    select: { grossAmount: true, discountAmount: true, status: true },
  });
}

export type InvoiceWriteResult =
  | { ok: true; id: string; number: string; status: InvoiceStatus }
  | { ok: false; error: string };

/**
 * Creates a DRAFT invoice (docs 05 §2: the discount-approval gate is on issuing,
 * so a receptionist can always prepare the bill). `number` is minted from
 * `Counter` inside the transaction; `netAmount` is derived here and the database
 * CHECK constraint re-proves the arithmetic.
 */
export async function createInvoice(
  input: CreateInvoiceInputData,
  userId: string
): Promise<InvoiceWriteResult> {
  const netAmount = input.grossAmount - input.discountAmount;
  if (netAmount < 0) return { ok: false, error: "Discount cannot be more than the fee" };

  // `InvoiceInstallment.dueDate` is not nullable, so a schedule row with no date
  // is refused instead of being silently filed as due today.
  const schedule: { seq: number; amount: number; dueDate: Date }[] = [];
  for (const item of input.installments) {
    const dueDate = parseDateOnly(item.dueDate);
    if (!dueDate) return { ok: false, error: `Instalment ${item.seq} needs a due date` };
    schedule.push({ seq: item.seq, amount: item.amount, dueDate });
  }

  const created = await db.$transaction(async (tx) => {
    const number = await generateInvoiceNumber(undefined, tx);
    return tx.invoice.create({
      data: {
        number,
        studentId: input.studentId,
        enrollmentId: input.enrollmentId ?? null,
        title: input.title,
        grossAmount: input.grossAmount,
        discountAmount: input.discountAmount,
        discountReason: input.discountReason ?? null,
        netAmount,
        status: "DRAFT",
        dueDate: input.dueDate ? parseDateOnly(input.dueDate) : null,
        note: input.note ?? null,
        createdById: userId,
        ...(schedule.length > 0 ? { installments: { create: schedule } } : {}),
      },
      select: { id: true, number: true, status: true },
    });
  });

  return { ok: true, ...created };
}

/**
 * DRAFT → ISSUED. Nothing else changes: an issued invoice is immutable, so a
 * mistake is corrected by voiding it and writing a new one (docs 05 §2).
 */
export async function issueInvoice(id: string): Promise<InvoiceWriteResult> {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, netAmount: true },
    });
    if (!invoice) return { ok: false, error: "Invoice not found" };
    if (invoice.status !== "DRAFT") {
      return { ok: false, error: "Only a draft invoice can be issued" };
    }

    // A fully waived fee (net 0) is settled the moment it becomes a bill.
    const status = nextInvoiceStatus("ISSUED", invoice.netAmount, 0);
    const flipped = await tx.invoice.updateMany({
      where: { id, status: "DRAFT" },
      data: { status },
    });
    if (flipped.count !== 1) {
      return { ok: false, error: "This invoice changed. Reload the page." };
    }
    return { ok: true, id: invoice.id, number: invoice.number, status };
  });
}

/**
 * VOID an invoice. Its receipts stay in the ledger — deleting money records would
 * break the audit trail — and the row keeps the reason next to what it explains.
 *
 * A bill that has taken money is not voided, because its receipts would go on
 * counting as collections against a bill that no longer exists (re-audit N9). The
 * clerk voids the receipts first — each with its own reason, which is also the
 * refund trail — and then the bill.
 */
export async function voidInvoice(
  id: string,
  reason: string
): Promise<InvoiceWriteResult> {
  return db.$transaction(async (tx) => {
    await lockInvoice(tx, id);
    const invoice = await tx.invoice.findUnique({
      where: { id },
      select: { id: true, number: true, status: true },
    });
    if (!invoice) return { ok: false, error: "Invoice not found" };
    if (invoice.status === "VOID") return { ok: false, error: "This invoice is already void" };

    const live = await tx.payment.count({ where: { invoiceId: id, status: "RECEIVED" } });
    if (live > 0) {
      return {
        ok: false,
        error: `Void its ${live} receipt${live === 1 ? "" : "s"} first — money already taken cannot belong to a dead bill`,
      };
    }

    const updated = await tx.invoice.updateMany({
      where: { id, status: { not: "VOID" } },
      data: { status: "VOID", voidReason: reason },
    });
    if (updated.count !== 1) return { ok: false, error: "This invoice changed. Reload the page." };
    return { ok: true, id: invoice.id, number: invoice.number, status: "VOID" };
  });
}

export type PaymentWriteResult =
  | {
      ok: true;
      id: string;
      receiptNo: string;
      invoiceId: string;
      invoiceStatus: InvoiceStatus;
      balance: number;
      /** This key was already spent: the receipt the first send of the dialog made. */
      replayed?: boolean;
    }
  | { ok: false; error: string };

/** One wording, so a clerk is never told two different things about a shut day. */
const CLOSED_DAY = "That day is closed. Ask an admin to reopen it.";

/** One slip backs one live receipt (fix guide §3). */
export const DUPLICATE_REFERENCE = "That reference is already recorded.";

/**
 * The partial unique index `Payment_method_reference_active_key` raises this when two
 * clerks send the same slip at the same moment — the in-transaction check in
 * `recordPayment` reads the same rule, but only the index closes the gap between them.
 */
export function isDuplicateReferenceViolation(error: unknown): boolean {
  if (!isP2002(error)) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return JSON.stringify(target ?? "").toLowerCase().includes("reference");
}

/** The `@db.Date` value Prisma matches a `DayClose.day` row on, from a day key. */
function dayColumn(dayKey: string | null | undefined): Date | null {
  return parseDateOnly(dayKey ?? "");
}

/**
 * Has this campus day been counted and shut (fix guide §2)? Once the cash has been
 * handed over, a receipt added to that day — or taken off it — makes the day book
 * lie, so both writes are refused inside the same transaction that makes them.
 */
async function isDayClosed(tx: Prisma.TransactionClient, day: Date | null): Promise<boolean> {
  if (!day) return false;
  const closed = await tx.dayClose.findUnique({ where: { day }, select: { day: true } });
  return closed !== null;
}

/**
 * Take the invoice row lock for the rest of the transaction.
 *
 * The money rules all read-then-write one invoice, so that row is the thing two
 * clerks contend for. Locking it explicitly means the second clerk simply waits
 * and then sees the first clerk's payment, which is the whole guarantee docs 05 §3
 * asks for. Serializable would also give it — but a conflict raised inside the raw
 * `Counter` upsert surfaces as `P2010`/`40001` rather than `P2034`, and a retry that
 * only reads `P2034` serves the clerk a failure for work the database never did.
 * `isRetryableTransactionFailure` still covers both codes for the deadlocks that
 * row locking cannot prevent (two invoices, two counters).
 */
async function lockInvoice(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
}

/**
 * Take the advisory lock for one campus day for the rest of the transaction.
 *
 * A day's cash book is not a row. `DayClose` is one row per day, but the promise
 * being defended — "the counted total is every receipt that day holds" — spans
 * every `Payment` with that date plus the close record, and on the very first
 * close of the day there is no `DayClose` row at all to lock. A transaction-level
 * advisory lock on the day key is what stands in for the missing row (fix guide
 * §2): `closeDay` counts inside it, `recordPayment` and `voidPayment`
 * check and write inside it, `reopenDay` deletes inside it, so a receipt can never
 * land between the count and the close row, and a day can never be reopened while
 * a receipt for it is still being written.
 *
 * `pg_advisory_xact_lock` is released by the commit or the rollback, so a crashed
 * request cannot strand a day. The key is a `hashtext` of the prefixed day, so a
 * hash collision between two dates only ever costs a spurious wait — never a
 * missing one.
 *
 * Lock order is day first, then the invoice row: every writer in this file takes
 * them in that order, which is what keeps two clerks working on the same day and
 * the same bill from deadlocking on each other. The lock is handed the same
 * `Date` the closed-check reads, so lock and rule cannot drift apart.
 */
async function lockDay(tx: Prisma.TransactionClient, day: Date | null): Promise<void> {
  if (!day) return;
  const key = `dayclose:${dateOnlyValue(day)}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}::text))`;
}

/**
 * Record a payment (docs 05 §3). The campus day is locked, then the invoice row,
 * so two clerks cannot both see a balance of 5,000 and both enter 5,000; the loser
 * waits, re-reads the balance that now includes the other payment and is refused if
 * it no longer fits. A rolled-back attempt does not burn a receipt number — the
 * `Counter` update rolls back with it, exactly like the insert.
 *
 * The dialog sends the same `idempotencyKey` for every click of one opening, so the
 * second send of a double-click — and the resend after a response was lost — replays
 * the receipt the first send made instead of taking the money twice (fix guide §1).
 */
export async function recordPayment(
  input: RecordPaymentInputData,
  userId: string
): Promise<PaymentWriteResult> {
  return db.$transaction(
    async (tx) => {
      // The action's schema already normalises this; a write that reaches the DAL by
      // another route has to land the same spelling, or the unique index would hold
      // "TXN1" and " txn1 " as two different slips.
      const reference = normalizePaymentReference(input.reference);

      // The day the clerk wrote on the counter is the day this receipt joins, so
      // the day lock comes first and the bill's row lock after it.
      const day = dayColumn(input.receivedAt ?? kathmanduDayKey());
      await lockDay(tx, day);
      await lockInvoice(tx, input.invoiceId);

      if (input.idempotencyKey) {
        const already = await tx.payment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: {
            id: true,
            receiptNo: true,
            invoiceId: true,
            amount: true,
            method: true,
            reference: true,
            invoice: { select: { status: true, netAmount: true } },
          },
        });
        if (already) {
          if (already.invoiceId !== input.invoiceId) {
            // One key belongs to one dialog and one bill. Anything else is a client
            // bug, and answering it with another invoice's balance would be a lie.
            return {
              ok: false,
              error: "This payment form was already used for another invoice. Reload and try again.",
            };
          }
          if (
            already.amount !== input.amount ||
            already.method !== input.method ||
            normalizePaymentReference(already.reference) !== reference
          ) {
            // The key says "the same send", the fields say otherwise. Returning the
            // first receipt would tell the clerk that the money they just changed
            // their mind about had been taken.
            return {
              ok: false,
              error:
                "This payment form already recorded a different amount, method or reference. Close it, reopen it and record this payment again.",
            };
          }
          const collected = await tx.payment.aggregate({
            where: { invoiceId: already.invoiceId, status: "RECEIVED" },
            _sum: { amount: true },
          });
          return {
            ok: true,
            id: already.id,
            receiptNo: already.receiptNo,
            invoiceId: already.invoiceId,
            invoiceStatus: already.invoice.status,
            balance: invoiceBalance(already.invoice.netAmount, collected._sum.amount ?? 0),
            replayed: true,
          };
        }
      }

      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true,
          number: true,
          status: true,
          netAmount: true,
          payments: { where: { status: "RECEIVED" }, select: { amount: true } },
        },
      });
      if (!invoice) return { ok: false, error: "Invoice not found" };
      if (invoice.status === "VOID") return { ok: false, error: "This invoice is void" };
      if (invoice.status === "DRAFT") {
        return { ok: false, error: "Issue the invoice before recording a payment" };
      }
      if (invoice.status === "PAID") {
        return { ok: false, error: "This invoice is already paid in full" };
      }

      // A day that has been counted and shut takes no new money (fix guide §2).
      if (await isDayClosed(tx, day)) {
        return { ok: false, error: CLOSED_DAY };
      }

      // One slip, one live receipt (fix guide §3). Read inside the same transaction
      // that writes, so the clerk is told before a receipt number is burned; the
      // partial unique index covers the sliver two clerks can both get here. Both
      // sides of the match are the normalised value, so it finds a slip recorded
      // under a different typing of the same characters.
      if (input.method !== "CASH" && reference) {
        const clash = await tx.payment.findFirst({
          where: { method: input.method, reference, status: "RECEIVED" },
          select: { receiptNo: true },
        });
        if (clash) return { ok: false, error: DUPLICATE_REFERENCE };
      }

      const paid = invoice.payments.reduce((sum, row) => sum + row.amount, 0);
      const balance = invoiceBalance(invoice.netAmount, paid);
      if (input.amount > balance) {
        return {
          ok: false,
          error: `That is more than the balance of NPR ${balance.toLocaleString("en-IN")}`,
        };
      }

      const receiptNo = await generateReceiptNumber(undefined, tx);
      // The day the clerk wrote on the counter is stamped as that day's campus
      // midnight, and read back through the same window in `dayRange`.
      const receivedAt = input.receivedAt
        ? (kathmanduDayRange(input.receivedAt)?.gte ?? new Date())
        : new Date();

      const payment = await tx.payment.create({
        data: {
          receiptNo,
          invoiceId: invoice.id,
          amount: input.amount,
          method: input.method,
          reference,
          status: "RECEIVED",
          receivedAt,
          receivedById: userId,
          idempotencyKey: input.idempotencyKey ?? null,
        },
        select: { id: true, receiptNo: true, invoiceId: true },
      });

      const newPaid = paid + input.amount;
      const invoiceStatus = nextInvoiceStatus(invoice.status, invoice.netAmount, newPaid);
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: invoiceStatus } });

      return {
        ok: true,
        id: payment.id,
        receiptNo: payment.receiptNo,
        invoiceId: payment.invoiceId,
        invoiceStatus,
        balance: invoiceBalance(invoice.netAmount, newPaid),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}

export type VoidPaymentResult =
  | { ok: true; invoiceId: string; balance: number; invoiceStatus: InvoiceStatus }
  | { ok: false; error: string };

/**
 * Void a payment. The receipt keeps its number and stays in every list; the
 * balance is recomputed from what is left, so a PAID invoice drops back to
 * PARTIAL or ISSUED (docs 05 §2, §9 test 3). The receipt is read first — its
 * date is what decides which day is being relieved — and then the day lock and
 * the invoice row lock are taken in that order, because the recomputed status is
 * the same column a payment in the next transaction writes.
 */
export async function voidPayment(
  id: string,
  reason: string,
  userId: string
): Promise<VoidPaymentResult> {
  return db.$transaction(
    async (tx) => {
      const receipt = await tx.payment.findUnique({
        where: { id },
        select: { id: true, status: true, invoiceId: true, receivedAt: true },
      });
      if (!receipt) return { ok: false, error: "Receipt not found" };
      if (receipt.status === "VOIDED") {
        return { ok: false, error: "This receipt is already voided" };
      }

      // Voiding moves money out of the day it was rung up, so a closed day is shut
      // to this write too (fix guide §2). `receivedAt` never changes once written,
      // which is what makes it safe to pick the day before holding anything.
      const day = dayColumn(kathmanduDayKey(receipt.receivedAt));
      await lockDay(tx, day);
      await lockInvoice(tx, receipt.invoiceId);

      if (await isDayClosed(tx, day)) {
        return { ok: false, error: CLOSED_DAY };
      }

      const invoice = await tx.invoice.findUnique({
        where: { id: receipt.invoiceId },
        select: { status: true, netAmount: true },
      });
      if (!invoice) return { ok: false, error: "Invoice not found" };

      const flipped = await tx.payment.updateMany({
        where: { id, status: "RECEIVED" },
        data: {
          status: "VOIDED",
          voidedAt: new Date(),
          voidedById: userId,
          voidReason: reason,
        },
      });
      if (flipped.count !== 1) {
        return { ok: false, error: "This receipt changed. Reload the page." };
      }

      const remaining = await tx.payment.aggregate({
        where: { invoiceId: receipt.invoiceId, status: "RECEIVED" },
        _sum: { amount: true },
      });
      const paid = remaining._sum.amount ?? 0;
      const invoiceStatus = nextInvoiceStatus(invoice.status, invoice.netAmount, paid);
      await tx.invoice.update({
        where: { id: receipt.invoiceId },
        data: { status: invoiceStatus },
      });

      return {
        ok: true,
        invoiceId: receipt.invoiceId,
        balance: invoiceBalance(invoice.netAmount, paid),
        invoiceStatus,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}

/* ───────────────────────── receipt PDF ───────────────────────── */

const receiptDocumentSelect = {
  id: true,
  receiptNo: true,
  amount: true,
  method: true,
  reference: true,
  status: true,
  receivedAt: true,
  voidedAt: true,
  voidReason: true,
  invoiceId: true,
  receivedBy: { select: { name: true } },
  // A VOID stamp without a name is not a trail (reaudit N14): whoever holds the
  // printed slip has to see whose undoing changed it.
  voidedBy: { select: { name: true } },
  invoice: {
    select: {
      id: true,
      studentId: true,
      number: true,
      title: true,
      netAmount: true,
      ...studentLite,
      enrollment: {
        select: { course: { select: { title: true } }, batch: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.PaymentSelect;

export type ReceiptDocument = Prisma.PaymentGetPayload<{
  select: typeof receiptDocumentSelect;
}>;

/** Everything the receipt route needs, so it can authorise before it renders. */
export async function getReceiptDocument(id: string): Promise<ReceiptDocument | null> {
  return db.payment.findUnique({ where: { id }, select: receiptDocumentSelect });
}

/**
 * Balance remaining after this receipt, counting the receipts taken before it.
 *
 * Same-instant pairs are ordered by `receiptNo`, not by row id: a back-dated
 * receipt is stamped at campus midnight, so a day's counter receipts all tie on
 * `receivedAt` and only the number series says which was written first. A voided
 * receipt prints the balance as it stands now, since its money was never real.
 */
export async function getBalanceAfterReceipt(
  document: Pick<ReceiptDocument, "invoiceId" | "receiptNo" | "receivedAt" | "status">
): Promise<number> {
  const invoice = await db.invoice.findUnique({
    where: { id: document.invoiceId },
    select: { netAmount: true },
  });
  if (!invoice) return 0;

  const rows = await db.payment.findMany({
    where: { invoiceId: document.invoiceId, status: "RECEIVED" },
    select: { amount: true, receivedAt: true, receiptNo: true },
  });

  const isCounted = document.status === "RECEIVED";
  const cut = document.receivedAt.getTime();
  const paidBefore = rows
    .filter((row) => {
      if (!isCounted) return true;
      const at = row.receivedAt.getTime();
      return at < cut || (at === cut && row.receiptNo < document.receiptNo);
    })
    .reduce((sum, row) => sum + row.amount, 0);

  return invoiceBalance(invoice.netAmount, paidBefore);
}
