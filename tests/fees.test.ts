import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Money tests (docs 05 §9). Four of the five checks are about what two clerks can
 * do to the same invoice at once, so the stand-in below reproduces the parts of
 * Postgres the code actually leans on rather than reimplementing the rules:
 *
 * - `$transaction` rolls every write back when the body throws;
 * - a serializable transaction that collides aborts with P2034;
 * - `Counter` hands out the next number with an atomic upsert;
 * - the amount CHECK constraints and the unique receipt number reject impossible
 *   rows, so a bug cannot pass by writing bad money into the store.
 */

type InvoiceRow = {
  id: string;
  number: string;
  title: string;
  status: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  dueDate: Date | null;
  studentId: string;
  enrollmentId: string | null;
  discountReason: string | null;
  note: string | null;
  voidReason: string | null;
  createdById: string;
  createdAt: Date;
  installments: { id: string; seq: number; amount: number; dueDate: Date }[];
};

type PaymentRow = {
  id: string;
  receiptNo: string;
  invoiceId: string;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  receivedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  receivedById: string;
  idempotencyKey: string | null;
};

/** `DayClose`, prisma/schema.prisma: one counted campus day, keyed by its date. */
type DayCloseRow = {
  id: string;
  day: Date;
  cashCounted: number | null;
  note: string | null;
  closedById: string | null;
  createdAt: Date;
};

const store = vi.hoisted(() => ({
  invoices: [] as InvoiceRow[],
  payments: [] as PaymentRow[],
  dayCloses: [] as DayCloseRow[],
  counters: {} as Record<string, number>,
  /** Set to make the next transaction abort the way a colliding one does. */
  abortNextTransaction: false,
  /** Shape the aborted transaction comes back in: engine code or raw SQLSTATE. */
  abortAs: "P2034" as "P2034" | "P2010",
  /** Which invoices `SELECT … FOR UPDATE` locked, so a dropped lock is visible. */
  locksTaken: [] as string[],
  /** Which day keys `pg_advisory_xact_lock` took, in the order they were asked for. */
  dayLocksTaken: [] as string[],
  /** How many times a writer had to wait for a day another writer was holding. */
  dayLockWaits: 0,
  /** Per transaction, the locks it took in the order it took them. */
  lockOrders: [] as string[][],
  /** Isolation level each transaction asked for. */
  isolationLevels: [] as string[],
  /** Set to make the next reference pre-check see a clear field, the way a slip
   *  committed between the read and the write really does. */
  blindNextReferenceCheck: false,
  sequence: 0,
}));

const sessionState = vi.hoisted(() => ({
  role: "ACCOUNTANT",
  denied: [] as string[],
  /** A clerk with no authenticator cannot pass a step-up gate (task 2). */
  twoFactorEnabled: true,
}));
const auditCalls = vi.hoisted(
  () => [] as { action: string; entityId?: string; summary?: string; meta?: Record<string, unknown> }[]
);
const settingsState = vi.hoisted(() => ({
  discountApprovalThresholdPct: 10,
  maxBackdateDays: 3,
}));
/**
 * Stands in for Better Auth's two-factor plugin (task 2). `failWith` is the machine
 * code a refused code carries, the same shape the real `APIError` has.
 */
const twoFactorState = vi.hoisted(() => ({
  totpCalls: 0,
  backupCalls: 0,
  failWith: null as string | null,
}));
/** Which throttle a step-up attempt is charged to, and how often. */
const guardState = vi.hoisted(() => ({
  scope: null as string | null,
  email: null as string | null,
  ipHash: null as string | null,
  failures: 0,
}));

vi.mock("@/server/db", () => {
  const receivedFor = (invoiceId: string) =>
    store.payments.filter((row) => row.invoiceId === invoiceId && row.status === "RECEIVED");

  /** The slice of `PaymentWhereInput` the fees DAL actually asks for. */
  type PaymentFilter = {
    invoiceId?: string;
    status?: string;
    method?: string;
    reference?: string | null;
    receivedAt?: { gte: Date; lt: Date };
  };
  const filterPayments = (where: PaymentFilter) =>
    store.payments.filter(
      (row) =>
        (where.invoiceId === undefined || row.invoiceId === where.invoiceId) &&
        (where.status === undefined || row.status === where.status) &&
        (where.method === undefined || row.method === where.method) &&
        (where.reference === undefined || row.reference === where.reference) &&
        (where.receivedAt === undefined ||
          (row.receivedAt >= where.receivedAt.gte && row.receivedAt < where.receivedAt.lt))
    );

  const invoiceModel = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = store.invoices.find((candidate) => candidate.id === where.id);
      if (!row) return null;
      return {
        ...structuredClone(row),
        payments: receivedFor(row.id).map((payment) => ({
          amount: payment.amount,
          status: payment.status,
        })),
      };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const gross = data.grossAmount as number;
      const discount = data.discountAmount as number;
      const net = data.netAmount as number;
      // Invoice_amounts_check / Invoice_netAmount_check, prisma/schema.prisma.
      if (net < 0 || gross - discount !== net || discount > gross) {
        throw new Error("Invoice_amounts_check violated");
      }
      const row: InvoiceRow = {
        id: `db-invoice-${++store.sequence}`,
        number: data.number as string,
        title: data.title as string,
        status: data.status as string,
        grossAmount: gross,
        discountAmount: discount,
        netAmount: net,
        dueDate: (data.dueDate as Date | undefined) ?? null,
        studentId: data.studentId as string,
        enrollmentId: (data.enrollmentId as string | null | undefined) ?? null,
        discountReason: (data.discountReason as string | null | undefined) ?? null,
        note: (data.note as string | null | undefined) ?? null,
        voidReason: null,
        createdById: data.createdById as string,
        createdAt: new Date(),
        installments: ((data.installments as { create: InvoiceRow["installments"] })?.create ?? [])
          .map((line, index) => ({ ...line, id: `db-line-${store.sequence}-${index}` }))
          .map((line) => ({ ...line, dueDate: new Date(line.dueDate) })),
      };
      store.invoices.push(row);
      return { id: row.id, number: row.number, status: row.status };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = store.invoices.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error("No invoice to update");
      Object.assign(row, data);
      return { id: row.id, number: row.number, status: row.status };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; status?: string | { not: string } };
      data: Record<string, unknown>;
    }) => {
      const matches = (row: InvoiceRow) => {
        if (row.id !== where.id) return false;
        if (where.status === undefined) return true;
        return typeof where.status === "string"
          ? row.status === where.status
          : row.status !== where.status.not;
      };
      const matched = store.invoices.filter(matches);
      matched.forEach((row) => Object.assign(row, data));
      return { count: matched.length };
    },
  };

  const paymentModel = {
    findUnique: async ({ where }: { where: { id?: string; idempotencyKey?: string } }) => {
      const row = store.payments.find(
        (candidate) =>
          (where.id !== undefined && candidate.id === where.id) ||
          (where.idempotencyKey !== undefined &&
            candidate.idempotencyKey !== null &&
            candidate.idempotencyKey === where.idempotencyKey)
      );
      if (!row) return null;
      const invoice = store.invoices.find((candidate) => candidate.id === row.invoiceId);
      return {
        ...structuredClone(row),
        invoice: { status: invoice?.status, netAmount: invoice?.netAmount },
      };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const receiptNo = data.receiptNo as string;
      if (store.payments.some((row) => row.receiptNo === receiptNo)) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      // Payment_idempotencyKey_key, prisma/schema.prisma. Many NULLs are allowed;
      // one used key belongs to one receipt.
      const idempotencyKey = (data.idempotencyKey as string | null | undefined) ?? null;
      if (
        idempotencyKey !== null &&
        store.payments.some((row) => row.idempotencyKey === idempotencyKey)
      ) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      // Payment_method_reference_active_key, the partial index in
      // prisma/migrations/20261105110000_payment_reference_unique/migration.sql.
      const method = data.method as string;
      const reference = (data.reference as string | null | undefined) ?? null;
      if (
        reference !== null &&
        method !== "CASH" &&
        data.status === "RECEIVED" &&
        store.payments.some(
          (row) => row.method === method && row.reference === reference && row.status === "RECEIVED"
        )
      ) {
        throw Object.assign(new Error("unique"), {
          code: "P2002",
          meta: { target: ["method", "reference"] },
        });
      }
      if ((data.amount as number) <= 0) throw new Error("Payment_amount_check violated");
      const row: PaymentRow = {
        id: `db-payment-${++store.sequence}`,
        receiptNo,
        invoiceId: data.invoiceId as string,
        amount: data.amount as number,
        method: data.method as string,
        reference: (data.reference as string | null | undefined) ?? null,
        status: data.status as string,
        receivedAt: data.receivedAt as Date,
        voidedAt: null,
        voidReason: null,
        receivedById: data.receivedById as string,
        idempotencyKey,
      };
      store.payments.push(row);
      return { id: row.id, receiptNo: row.receiptNo, invoiceId: row.invoiceId };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; status?: string };
      data: Record<string, unknown>;
    }) => {
      const matched = store.payments.filter(
        (row) => row.id === where.id && (where.status === undefined || row.status === where.status)
      );
      matched.forEach((row) => Object.assign(row, data));
      return { count: matched.length };
    },
    aggregate: async ({ where }: { where: PaymentFilter }) => ({
      _sum: {
        amount: filterPayments(where).reduce((sum, row) => sum + row.amount, 0),
      },
    }),
    findFirst: async ({ where }: { where: PaymentFilter }) => {
      if (store.blindNextReferenceCheck) {
        store.blindNextReferenceCheck = false;
        return null;
      }
      const row = filterPayments(where)[0];
      return row ? structuredClone(row) : null;
    },
    count: async ({ where }: { where: PaymentFilter }) => filterPayments(where).length,
    findMany: async ({ where }: { where: PaymentFilter }) =>
      filterPayments(where).map((row) => structuredClone(row)),
  };

  /** `DayClose`: the date is the key, so a second close of one day cannot land. */
  const dayCloseModel = {
    findUnique: async ({ where }: { where: { day: Date } }) => {
      const row = store.dayCloses.find((candidate) => candidate.day.getTime() === where.day.getTime());
      if (!row) return null;
      return { ...structuredClone(row), closedBy: { name: "Accounts" } };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const day = data.day as Date;
      // DayClose_day_key, prisma/schema.prisma.
      if (store.dayCloses.some((row) => row.day.getTime() === day.getTime())) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      const row: DayCloseRow = {
        id: `db-dayclose-${++store.sequence}`,
        day,
        cashCounted: (data.cashCounted as number | null | undefined) ?? null,
        note: (data.note as string | null | undefined) ?? null,
        closedById: (data.closedById as string | null | undefined) ?? null,
        createdAt: new Date("2026-11-05T10:00:00Z"),
      };
      store.dayCloses.push(row);
      return { id: row.id };
    },
    deleteMany: async ({ where }: { where: { day: Date } }) => {
      const kept = store.dayCloses.filter((row) => row.day.getTime() !== where.day.getTime());
      const removed = store.dayCloses.length - kept.length;
      store.dayCloses = kept;
      return { count: removed };
    },
  };

  /** One writer per invoice, the way `SELECT … FOR UPDATE` gives it. */
  const invoiceLocks = new Map<string, Promise<void>>();
  const acquireInvoiceLock = async (invoiceId: string): Promise<() => void> => {
    const waiting = invoiceLocks.get(invoiceId) ?? Promise.resolve();
    let releaseHold = () => {};
    const holding = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    const chain = waiting.then(() => holding);
    invoiceLocks.set(invoiceId, chain);
    store.locksTaken.push(invoiceId);
    await waiting;
    return () => {
      releaseHold();
      if (invoiceLocks.get(invoiceId) === chain) invoiceLocks.delete(invoiceId);
    };
  };

  /** One writer per campus day, the way the advisory `dayclose:<date>` lock gives it. */
  const dayLocks = new Map<string, Promise<void>>();
  const acquireDayLock = async (key: string): Promise<() => void> => {
    const waiting = dayLocks.get(key);
    if (waiting) store.dayLockWaits += 1;
    const queued = waiting ?? Promise.resolve();
    let releaseHold = () => {};
    const holding = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    const chain = queued.then(() => holding);
    dayLocks.set(key, chain);
    store.dayLocksTaken.push(key);
    await queued;
    return () => {
      releaseHold();
      if (dayLocks.get(key) === chain) dayLocks.delete(key);
    };
  };

  /**
   * `duesAgingQuery` from `src/server/dal/fees.ts`, answered the way PostgreSQL
   * would: the three boundaries arrive as `YYYY-MM-DD` text, the `@db.Date`
   * column is a whole day, and `::bigint` comes back as a BigInt. Nothing here
   * reuses the aging code in `services/fees.ts` — the tests compare this against
   * `agingOf()`, so the SQL and the JS have to agree to pass.
   */
  const duesAgingRows = (values: readonly unknown[]) => {
    const [today, weekAgo, monthAgo] = values.slice(0, 3).map(String);
    const statuses = values.slice(3).map(String);
    const bucketOf = (dueDate: Date | null) => {
      if (!dueDate) return "UNDATED";
      const due = dueDate.toISOString().slice(0, 10);
      if (due >= today) return "CURRENT";
      if (due >= weekAgo) return "OVERDUE_1_7";
      if (due >= monthAgo) return "OVERDUE_8_30";
      return "OVERDUE_30_PLUS";
    };
    const grouped = new Map<string, { count: number; balance: number }>();
    for (const invoice of store.invoices) {
      if (!statuses.includes(invoice.status)) continue;
      const paid = receivedFor(invoice.id).reduce((sum, payment) => sum + payment.amount, 0);
      const bucket = bucketOf(invoice.dueDate);
      const seen = grouped.get(bucket) ?? { count: 0, balance: 0 };
      grouped.set(bucket, {
        count: seen.count + 1,
        balance: seen.balance + invoice.netAmount - paid,
      });
    }
    return [...grouped].map(([bucket, totals]) => ({
      bucket,
      count: totals.count,
      // `::bigint` really does come back as a BigInt, which is what the DAL guards against.
      balance: BigInt(totals.balance),
    }));
  };

  /** `nextSequence` / `peekSequence` and the invoice row lock are raw SQL. */
  const queryRaw = async (
    scope: {
      lock: (invoiceId: string) => Promise<() => void>;
      lockDay: (key: string) => Promise<() => void>;
    },
    query: TemplateStringsArray | { strings: readonly string[]; values: readonly unknown[] },
    ...rest: unknown[]
  ) => {
    // A `Prisma.sql` builder (the dues aging aggregate) arrives as one object
    // with its values already attached, instead of a template plus its values.
    const fragment: { strings: readonly string[]; values: readonly unknown[] } =
      "strings" in query ? query : { strings: query, values: rest };
    const strings = fragment.strings;
    const values = fragment.values;
    const sql = strings.join(" ");
    if (sql.includes("FOR UPDATE")) {
      return scope.lock(String(values[0])).then(() => []);
    }
    if (sql.includes("pg_advisory_xact_lock")) {
      return scope.lockDay(String(values[0])).then(() => []);
    }
    if (sql.includes("WITH received AS")) {
      return duesAgingRows(values);
    }
    const key = values[0] as string;
    if (sql.includes("ON CONFLICT")) {
      store.counters[key] = (store.counters[key] ?? 0) + 1;
      return [{ value: store.counters[key] }];
    }
    const current = store.counters[key];
    return current === undefined ? [] : [{ value: current }];
  };

  const idleScope = {
    lock: async () => () => {},
    lockDay: async () => () => {},
  };
  const client = {
    $queryRaw: (
      query: TemplateStringsArray | { strings: readonly string[]; values: readonly unknown[] },
      ...values: unknown[]
    ) => queryRaw(idleScope, query, ...values),
    invoice: invoiceModel,
    payment: paymentModel,
    dayClose: dayCloseModel,
  };

  return {
    // `src/server/auth.ts` reads it at module scope through the Prisma adapter.
    // Nothing in the money path queries it: the second-factor check below stands
    // in for Better Auth instead.
    prisma: {},
    db: {
      ...client,
      $transaction: async (
        fn: (tx: typeof client) => Promise<unknown>,
        options?: { isolationLevel?: string }
      ) => {
        if (store.abortNextTransaction) {
          store.abortNextTransaction = false;
          const message = "could not serialize access due to concurrent update";
          throw store.abortAs === "P2010"
            ? Object.assign(new Error(`Raw query failed. Postgres: ${message}`), {
                code: "P2010",
                meta: { code: "40001", message },
              })
            : Object.assign(new Error(message), { code: "P2034" });
        }
        store.isolationLevels.push(options?.isolationLevel ?? "default");
        const invoices = structuredClone(store.invoices);
        const payments = structuredClone(store.payments);
        const dayCloses = structuredClone(store.dayCloses);
        const counters = { ...store.counters };
        const held: (() => void)[] = [];
        const events: string[] = [];
        const scope = {
          lockDay: async (key: string) => {
            events.push(`day:${key}`);
            const release = await acquireDayLock(key);
            held.push(release);
            return release;
          },
          lock: async (invoiceId: string) => {
            events.push(`invoice:${invoiceId}`);
            const release = await acquireInvoiceLock(invoiceId);
            held.push(release);
            return release;
          },
        };
        const txClient = {
          ...client,
          $queryRaw: (
            query: TemplateStringsArray | { strings: readonly string[]; values: readonly unknown[] },
            ...values: unknown[]
          ) => queryRaw(scope, query, ...values),
        };
        try {
          return await fn(txClient);
        } catch (error) {
          // Nothing survives a rollback — including the receipt number.
          store.invoices = invoices;
          store.payments = payments;
          store.dayCloses = dayCloses;
          store.counters = counters;
          throw error;
        } finally {
          store.lockOrders.push(events);
          held.forEach((release) => release());
        }
      },
    },
  };
});

/**
 * The second factor (task 2) runs for real here: `requireStepUp()` decides whether
 * a void goes through, so these stand-ins only replace what a unit test cannot
 * hold — Better Auth's TOTP window, the sign-in throttle's counters, the request
 * headers, and the mail the void alerts. What is asserted is the gate itself.
 */
vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      verifyTOTP: async () => {
        twoFactorState.totpCalls += 1;
        if (twoFactorState.failWith) {
          throw Object.assign(new Error("Invalid code"), {
            body: { code: twoFactorState.failWith },
          });
        }
        return { verified: true };
      },
      verifyBackupCode: async () => {
        twoFactorState.backupCalls += 1;
        if (twoFactorState.failWith) {
          throw Object.assign(new Error("Invalid backup code"), {
            body: { code: twoFactorState.failWith },
          });
        }
        return { valid: true };
      },
    },
  },
}));

// The budget lives in `RateLimitBucket` and is tested in signin-guard.test.ts.
// What is checked here is which attempts are charged to it (task 2).
vi.mock("@/server/services/signin-guard", () => ({
  createSigninGuard: (scope: string, email: string, ipHash: string) => {
    guardState.scope = scope;
    guardState.email = email;
    guardState.ipHash = ipHash;
    return {
      checkGate: async () => "allowed",
      recordFailure: async () => {
        guardState.failures += 1;
      },
      recordWrongPortal: async () => {},
    };
  },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
// Who gets mailed about a void is void-alerts.test.ts's subject.
vi.mock("@/server/services/void-alerts", () => ({ notifyVoided: async () => {} }));

vi.mock("@/server/session", () => ({
  requirePermission: async (action: string) => {
    if (sessionState.denied.includes(action)) {
      throw Object.assign(new Error(`FORBIDDEN: missing permission ${action}`), {
        code: "FORBIDDEN",
      });
    }
    return {
      id: "user-1",
      email: "accounts@example.com",
      name: "Accounts",
      role: sessionState.role,
      twoFactorEnabled: sessionState.twoFactorEnabled,
    };
  },
  isRedirectError: () => false,
}));

vi.mock("@/server/services/audit", () => ({
  audit: async (input: (typeof auditCalls)[number]) => {
    auditCalls.push(input);
  },
}));

vi.mock("@/server/revalidate", () => ({
  invalidate: () => {},
  FEE_TAGS: ["daybook"],
  invoiceWriteTags: (id?: string | null) => (id ? [`invoice:${id}`] : ["invoices"]),
  paymentWriteTags: () => ["payments"],
}));

vi.mock("@/server/dal/settings", () => ({
  getSiteSettings: async () => ({
    fees: {
      discountApprovalThresholdPct: settingsState.discountApprovalThresholdPct,
      maxBackdateDays: settingsState.maxBackdateDays,
    },
  }),
}));

const {
  createInvoice,
  getBalanceAfterReceipt,
  issueInvoice,
  recordPayment,
  voidInvoice,
  voidPayment,
  closeDay,
  reopenDay,
  duesAgingQuery,
  getDuesSummary,
  DUPLICATE_REFERENCE,
  isDuplicateReferenceViolation,
} = await import("@/server/dal/fees");
const {
  closeDayAction,
  createInvoiceAction,
  issueInvoiceAction,
  recordPaymentAction,
  reopenDayAction,
  voidInvoiceAction,
  voidPaymentAction,
} = await import("@/server/actions/fees");
const {
  agingOf,
  invoiceBalance,
  needsDiscountApproval,
  nextDueInstallment,
  nextInvoiceStatus,
} = await import("@/server/services/fees");
const { can } = await import("@/server/permissions");
const { STEP_UP_NOT_ENROLLED, STEP_UP_REQUIRED } = await import("@/server/services/step-up");
const { STEP_UP_CODE_MESSAGE } = await import("@/lib/validators/step-up");
const { kathmanduDayRange, parseDateOnly } = await import("@/lib/dates");
const { kathmanduDayKey } = await import("@/lib/format");
const { normalizePaymentReference, recordPaymentSchema } = await import("@/lib/validators/fees");

function seedInvoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  const row: InvoiceRow = {
    id: overrides.id ?? "inv-1",
    number: overrides.number ?? "INV-2026-00001",
    title: "Web Development fee",
    status: "ISSUED",
    grossAmount: 15000,
    discountAmount: 0,
    netAmount: 15000,
    dueDate: new Date("2026-11-01T00:00:00Z"),
    studentId: "stu-1",
    enrollmentId: "enr-1",
    discountReason: null,
    note: null,
    voidReason: null,
    createdById: "user-1",
    createdAt: new Date("2026-10-20T06:00:00Z"),
    installments: [],
    ...overrides,
  };
  store.invoices.push(row);
  return row;
}

function seedPayment(
  invoiceId: string,
  amount: number,
  status = "RECEIVED",
  idempotencyKey: string | null = null
): PaymentRow {
  const row: PaymentRow = {
    id: `pay-${store.payments.length + 1}`,
    receiptNo: `RCPT-2026-0000${store.payments.length + 1}`,
    invoiceId,
    amount,
    method: "CASH",
    reference: null,
    status,
    receivedAt: new Date("2026-11-04T06:00:00Z"),
    voidedAt: null,
    voidReason: null,
    receivedById: "user-1",
    idempotencyKey,
  };
  store.payments.push(row);
  return row;
}

/** A day already counted and shut, the way `closeDay` writes it. */
function seedDayClosed(dayKey: string, cashCounted: number | null = null): DayCloseRow {
  const row: DayCloseRow = {
    id: `close-${store.dayCloses.length + 1}`,
    day: parseDateOnly(dayKey)!,
    cashCounted,
    note: null,
    closedById: "user-1",
    createdAt: new Date("2026-11-05T10:00:00Z"),
  };
  store.dayCloses.push(row);
  return row;
}

/** A fresh dialog opening, the way `RecordPaymentDialog` mints one with `crypto.randomUUID()`. */
const key = () => crypto.randomUUID();

beforeEach(() => {
  store.invoices = [];
  store.payments = [];
  store.dayCloses = [];
  store.counters = {};
  store.abortNextTransaction = false;
  store.abortAs = "P2034";
  store.locksTaken = [];
  store.dayLocksTaken = [];
  store.dayLockWaits = 0;
  store.lockOrders = [];
  store.isolationLevels = [];
  store.blindNextReferenceCheck = false;
  store.sequence = 0;
  sessionState.role = "ACCOUNTANT";
  sessionState.denied = [];
  sessionState.twoFactorEnabled = true;
  twoFactorState.totpCalls = 0;
  twoFactorState.backupCalls = 0;
  twoFactorState.failWith = null;
  guardState.scope = null;
  guardState.email = null;
  guardState.ipHash = null;
  guardState.failures = 0;
  auditCalls.length = 0;
  settingsState.discountApprovalThresholdPct = 10;
  settingsState.maxBackdateDays = 3;
});

/* ───────────────── the rules themselves ───────────────── */

describe("balance and status (docs 05 §2)", () => {
  it("computes the balance from RECEIVED money only", () => {
    expect(invoiceBalance(15000, 5000)).toBe(10000);
    expect(nextInvoiceStatus("ISSUED", 15000, 5000)).toBe("PARTIAL");
    expect(nextInvoiceStatus("ISSUED", 15000, 15000)).toBe("PAID");
    // A voided receipt returns the invoice to the status the money justifies.
    expect(nextInvoiceStatus("PAID", 15000, 0)).toBe("ISSUED");
    expect(nextInvoiceStatus("PAID", 15000, 7000)).toBe("PARTIAL");
  });

  it("leaves a draft and a dead invoice alone", () => {
    expect(nextInvoiceStatus("DRAFT", 15000, 15000)).toBe("DRAFT");
    expect(nextInvoiceStatus("VOID", 15000, 0)).toBe("VOID");
  });

  it("treats instalments as a schedule, not as buckets money lands in", () => {
    const schedule = [
      { seq: 1, amount: 5000, dueDate: new Date("2026-11-01T00:00:00Z") },
      { seq: 2, amount: 5000, dueDate: new Date("2026-12-01T00:00:00Z") },
      { seq: 3, amount: 5000, dueDate: new Date("2027-01-01T00:00:00Z") },
    ];
    expect(nextDueInstallment(schedule, 0)?.amount).toBe(5000);
    expect(nextDueInstallment(schedule, 5000)?.seq).toBe(2);
    expect(nextDueInstallment(schedule, 10000)?.seq).toBe(3);
    expect(nextDueInstallment(schedule, 15000)).toBeNull();
  });

  it("ages a bill from its due date, undated last", () => {
    const now = new Date("2026-11-05T06:00:00Z"); // 11:45 in Kathmandu
    expect(agingOf(new Date("2026-11-10T00:00:00Z"), now).bucket).toBe("CURRENT");
    expect(agingOf(new Date("2026-11-03T00:00:00Z"), now).bucket).toBe("OVERDUE_1_7");
    expect(agingOf(new Date("2026-10-20T00:00:00Z"), now).bucket).toBe("OVERDUE_8_30");
    expect(agingOf(new Date("2026-08-01T00:00:00Z"), now).bucket).toBe("OVERDUE_30_PLUS");
    expect(agingOf(null, now).bucket).toBe("UNDATED");
  });

  it("calls a discount over the threshold one an admin must approve", () => {
    expect(needsDiscountApproval(10000, 1000, 10)).toBe(false);
    expect(needsDiscountApproval(10000, 1001, 10)).toBe(true);
    expect(needsDiscountApproval(10000, 0, 10)).toBe(false);
  });
});

/* ───────────────────── writing money ───────────────────── */

describe("recordPayment (docs 05 §9 test 1)", () => {
  it("refuses more than the live balance", async () => {
    seedInvoice({ netAmount: 15000 });
    seedPayment("inv-1", 13000);

    const result = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH" },
      "user-1"
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/more than the balance/);
    // The refused receipt never reached the ledger.
    expect(store.payments).toHaveLength(1);
    expect(store.invoices[0]?.status).toBe("ISSUED");
  });

  it("will not take money for a draft or a voided bill", async () => {
    seedInvoice({ id: "inv-draft", status: "DRAFT" });
    seedInvoice({ id: "inv-void", status: "VOID" });

    expect(
      (await recordPayment({ invoiceId: "inv-draft", amount: 500, method: "CASH" }, "user-1"))
        .ok
    ).toBe(false);
    const voided = await recordPayment({ invoiceId: "inv-void", amount: 500, method: "CASH" }, "user-1");
    expect(!voided.ok && voided.error).toBe("This invoice is void");
  });

  it("marks PARTIAL, then PAID, and keeps receipt numbers unique and ordered", async () => {
    seedInvoice({ netAmount: 15000 });

    const first = await recordPayment({ invoiceId: "inv-1", amount: 5000, method: "CASH" }, "user-1");
    const second = await recordPayment({ invoiceId: "inv-1", amount: 10000, method: "BANK_TRANSFER" }, "user-1");

    expect(first.ok && first.invoiceStatus).toBe("PARTIAL");
    expect(first.ok && first.balance).toBe(10000);
    expect(second.ok && second.invoiceStatus).toBe("PAID");
    expect(store.invoices[0]?.status).toBe("PAID");

    const numbers = store.payments.map((row) => row.receiptNo);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).toEqual(["RCPT-2026-00001", "RCPT-2026-00002"]);
    expect(store.counters["receipt:2026"]).toBe(2);
  });
});

describe("the counter day and the day book (docs 05 §5)", () => {
  it("stamps the day the clerk wrote as its own Kathmandu midnight", async () => {
    seedInvoice({ netAmount: 15000 });

    await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: "2026-11-05" },
      "user-1"
    );

    const stamp = store.payments[0]?.receivedAt;
    expect(stamp && kathmanduDayKey(stamp)).toBe("2026-11-05");
    expect(stamp?.getTime()).toBe(kathmanduDayRange("2026-11-05")?.gte.getTime());
  });

  it("finds that receipt in the same day's window, and not in the next", async () => {
    seedInvoice({ netAmount: 15000 });

    await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: "2026-11-05" },
      "user-1"
    );

    const stamp = store.payments[0]!.receivedAt;
    const day = kathmanduDayRange("2026-11-05")!;
    const nextDay = kathmanduDayRange("2026-11-06")!;
    expect(stamp >= day.gte && stamp < day.lt).toBe(true);
    expect(stamp >= nextDay.gte && stamp < nextDay.lt).toBe(false);
    // The morning counter cash is exactly what a UTC-midnight window would lose:
    // 2026-11-05 campus midnight is 2026-11-04T18:15Z, before 5 Nov starts in UTC.
    expect(stamp < new Date("2026-11-05T00:00:00Z")).toBe(true);
  });

  it("has no window for a value that is not a day", () => {
    expect(kathmanduDayRange("2026-11-5")).toBeNull();
    expect(kathmanduDayRange("")).toBeNull();
  });
});

describe("voidPayment (docs 05 §9 test 3)", () => {
  it("restores the balance and the status it came from", async () => {
    seedInvoice({ netAmount: 15000, status: "PAID" });
    const receipt = seedPayment("inv-1", 15000);

    const result = await voidPayment(receipt.id, "Entered against the wrong invoice", "user-2");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.balance).toBe(15000);
      expect(result.invoiceStatus).toBe("ISSUED");
    }
    expect(store.invoices[0]?.status).toBe("ISSUED");
    // The receipt stays in the ledger with its number and reason (docs 05 §2).
    expect(store.payments[0]?.status).toBe("VOIDED");
    expect(store.payments[0]?.voidReason).toBe("Entered against the wrong invoice");
  });

  it("drops a paid bill to partial, not back to nothing, when one receipt of two is voided", async () => {
    seedInvoice({ netAmount: 15000, status: "PAID" });
    const half = seedPayment("inv-1", 7000);
    seedPayment("inv-1", 8000);

    const result = await voidPayment(half.id, "Cash shortfall", "user-2");
    if (!result.ok) throw new Error(result.error);
    expect(result.balance).toBe(7000);
    expect(result.invoiceStatus).toBe("PARTIAL");
    expect(store.invoices[0]?.status).toBe("PARTIAL");
  });

  it("cannot be voided twice", async () => {
    seedInvoice({ netAmount: 15000, status: "PARTIAL" });
    const receipt = seedPayment("inv-1", 5000);

    expect((await voidPayment(receipt.id, "Duplicate entry", "user-2")).ok).toBe(true);
    const twice = await voidPayment(receipt.id, "Duplicate entry", "user-2");
    expect(!twice.ok && twice.error).toBe("This receipt is already voided");
    // The second attempt left the recomputed balance where the first put it.
    expect(store.invoices[0]?.status).toBe("ISSUED");
  });
});

/* ─────────────────── the actions on top ─────────────────── */

describe("concurrent clerks (docs 05 §9 test 1)", () => {
  it("retries once when Postgres aborts the loser, and still cannot overpay", async () => {
    seedInvoice({ netAmount: 15000 });
    // Another clerk committed between this read and this write.
    store.abortNextTransaction = true;

    const result = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "9000",
      method: "CASH",
      idempotencyKey: key(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.invoiceStatus).toBe("PARTIAL");
      expect(result.data.balance).toBe(6000);
    }
    // The aborted attempt wrote nothing; the retry wrote one receipt.
    expect(store.payments).toHaveLength(1);
    expect(store.counters["receipt:2026"]).toBe(1);
  });

  it("refuses the second half once the first clerk paid it all", async () => {
    seedInvoice({ netAmount: 15000 });

    const paid = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "15000",
      method: "CASH",
      idempotencyKey: key(),
    });
    expect(paid.ok).toBe(true);

    const greedy = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "1",
      method: "CASH",
      idempotencyKey: key(),
    });
    expect(!greedy.ok && greedy.error).toBe("This invoice is already paid in full");
    expect(store.payments).toHaveLength(1);
  });

  it("retries when the abort comes back as a raw SQLSTATE, not as P2034", async () => {
    seedInvoice({ netAmount: 15000 });
    store.abortNextTransaction = true;
    store.abortAs = "P2010";

    const result = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "9000",
      method: "CASH",
      idempotencyKey: key(),
    });

    expect(result.ok).toBe(true);
    expect(store.payments).toHaveLength(1);
    expect(store.counters["receipt:2026"]).toBe(1);
  });

  it("locks the bill instead of asking Postgres to serialise the whole read", async () => {
    seedInvoice({ netAmount: 15000 });

    await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CASH",
      idempotencyKey: key(),
    });

    expect(store.locksTaken).toContain("inv-1");
    expect(store.isolationLevels).toContain("ReadCommitted");
  });

  it("takes the same lock when a receipt is undone", async () => {
    seedInvoice({ netAmount: 15000, status: "PARTIAL" });
    const receipt = seedPayment("inv-1", 5000);

    await voidPayment(receipt.id, "Keyed against the wrong bill", "user-2");

    expect(store.locksTaken).toContain("inv-1");
  });

  it("ten clerks on one bill cannot pay it twice over", async () => {
    seedInvoice({ netAmount: 9000 });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        recordPaymentAction({
          invoiceId: "inv-1",
          amount: "1000",
          method: "CASH",
          idempotencyKey: key(),
        })
      )
    );

    const accepted = results.filter((result) => result.ok);
    const refused = results.find((result) => !result.ok);
    // Nine fit, the tenth is refused for a reason the clerk can read.
    expect(accepted).toHaveLength(9);
    expect(refused && !refused.ok && refused.error).toBe("This invoice is already paid in full");
    expect(store.invoices[0]?.status).toBe("PAID");

    const paidOut = store.payments.reduce((sum, row) => sum + row.amount, 0);
    expect(paidOut).toBe(9000);
    const numbers = store.payments.map((row) => row.receiptNo);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("twenty receipts across five bills all land, numbered once each", async () => {
    const invoices = ["inv-1", "inv-2", "inv-3", "inv-4", "inv-5"];
    invoices.forEach((id) => seedInvoice({ id, netAmount: 20000 }));

    const results = await Promise.all(
      invoices.flatMap((id) =>
        Array.from({ length: 4 }, () =>
          recordPaymentAction({
            invoiceId: id,
            amount: "1000",
            method: "CASH",
            idempotencyKey: key(),
          })
        )
      )
    );

    expect(results.every((result) => result.ok)).toBe(true);
    expect(store.payments).toHaveLength(20);
    const numbers = store.payments.map((row) => row.receiptNo);
    expect(new Set(numbers).size).toBe(20);
    expect(store.counters["receipt:2026"]).toBe(20);
    // Each bill settled its own money, not another clerk's.
    invoices.forEach((id) => {
      const paid = store.payments
        .filter((row) => row.invoiceId === id && row.status === "RECEIVED")
        .reduce((sum, row) => sum + row.amount, 0);
      expect(paid).toBe(4000);
    });
  });
});

/* ───────────── one dialog opening, one receipt ───────────── */

describe("payment idempotency (fix guide §1)", () => {
  it("reports the first receipt for the second send of the same dialog", async () => {
    seedInvoice({ netAmount: 15000 });
    const opened = key();

    const first = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", idempotencyKey: opened },
      "user-1"
    );
    const second = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", idempotencyKey: opened },
      "user-1"
    );

    expect(first.ok && first.replayed).toBeUndefined();
    expect(second.ok && second.replayed).toBe(true);
    if (first.ok && second.ok) {
      expect(second.id).toBe(first.id);
      expect(second.receiptNo).toBe(first.receiptNo);
      expect(second.balance).toBe(first.balance);
    }
    // One money record and one number burned, not two.
    expect(store.payments).toHaveLength(1);
    expect(store.counters["receipt:2026"]).toBe(1);
  });

  it("answers a replay with the balance as it stands, not as the first send left it", async () => {
    seedInvoice({ netAmount: 15000 });
    const opened = key();

    const first = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", idempotencyKey: opened },
      "user-1"
    );
    // Another clerk settles part of the same bill while this dialog sits open.
    await recordPayment(
      { invoiceId: "inv-1", amount: 4000, method: "BANK_TRANSFER", idempotencyKey: key() },
      "user-2"
    );
    const replay = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", idempotencyKey: opened },
      "user-1"
    );

    expect(first.ok && first.balance).toBe(10000);
    expect(replay.ok && replay.balance).toBe(6000);
    expect(replay.ok && replay.invoiceStatus).toBe("PARTIAL");
    expect(store.payments).toHaveLength(2);
  });

  it("will not spend one dialog's key on a second invoice", async () => {
    seedInvoice({ netAmount: 15000 });
    seedInvoice({ id: "inv-2", number: "INV-2026-00002", netAmount: 8000 });
    const opened = key();

    const first = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", idempotencyKey: opened },
      "user-1"
    );
    const crossed = await recordPayment(
      { invoiceId: "inv-2", amount: 3000, method: "CASH", idempotencyKey: opened },
      "user-1"
    );

    expect(first.ok).toBe(true);
    expect(!crossed.ok && crossed.error).toMatch(/another invoice/);
    expect(store.payments).toHaveLength(1);
    expect(store.invoices[1]?.status).toBe("ISSUED");
  });

  it("refuses a replay that changed the money", async () => {
    seedInvoice({ netAmount: 15000 });
    const opened = key();

    const first = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", idempotencyKey: opened },
      "user-1"
    );
    const changedAmount = await recordPayment(
      { invoiceId: "inv-1", amount: 4000, method: "CASH", idempotencyKey: opened },
      "user-1"
    );
    const changedMethod = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "BANK_TRANSFER", idempotencyKey: opened },
      "user-1"
    );

    expect(first.ok).toBe(true);
    // A key says "the same send". When the fields disagree, the old receipt cannot be
    // the answer: that would report money the clerk had just changed their mind about.
    expect(!changedAmount.ok && changedAmount.error).toMatch(/already recorded a different/);
    expect(!changedMethod.ok && changedMethod.error).toMatch(/already recorded a different/);
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]?.amount).toBe(5000);
    expect(store.invoices[0]?.status).toBe("PARTIAL");
  });

  it("refuses a replay that changed the slip", async () => {
    seedInvoice({ netAmount: 15000 });
    const opened = key();

    const first = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "ESEWA", reference: "EW-1", idempotencyKey: opened },
      "user-1"
    );
    const changedSlip = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "ESEWA", reference: "ew 2", idempotencyKey: opened },
      "user-1"
    );

    expect(first.ok).toBe(true);
    expect(!changedSlip.ok && changedSlip.error).toMatch(/already recorded a different/);
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]?.reference).toBe("EW-1");
  });

  it("replays a receipt whose slip was typed a different way", async () => {
    seedInvoice({ netAmount: 15000 });
    const opened = key();

    const first = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "ESEWA", reference: "EW-9", idempotencyKey: opened },
      "user-1"
    );
    // The resend after a lost response carries the same characters in a different
    // case or spacing; normalised it is the same payment, so it must replay rather
    // than be refused as a changed one.
    const resent = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "ESEWA", reference: "  ew-9\t", idempotencyKey: opened },
      "user-1"
    );

    expect(first.ok).toBe(true);
    expect(resent.ok && resent.replayed).toBe(true);
    expect(store.payments).toHaveLength(1);
  });

  it("keeps taking money for a write that carries no key", async () => {
    seedInvoice({ netAmount: 15000 });

    // The key is a dialog concern; a gateway credit that credits straight through the
    // DAL has none, and the unique index lets any number of them be NULL.
    const a = await recordPayment({ invoiceId: "inv-1", amount: 1000, method: "CASH" }, "user-1");
    const b = await recordPayment({ invoiceId: "inv-1", amount: 1000, method: "CASH" }, "user-1");

    expect(a.ok && b.ok).toBe(true);
    expect(store.payments).toHaveLength(2);
  });

  it("asks the action for a key instead of trusting the click count", async () => {
    seedInvoice({ netAmount: 15000 });

    const noKey = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CASH",
    });
    expect(noKey.ok).toBe(false);
    expect(!noKey.ok && noKey.fieldErrors?.idempotencyKey?.[0]).toMatch(/Reload the page/i);
    expect(store.payments).toHaveLength(0);

    const opened = key();
    const first = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CASH",
      idempotencyKey: opened,
    });
    const resent = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CASH",
      idempotencyKey: opened,
    });

    expect(first.ok && resent.ok).toBe(true);
    if (first.ok && resent.ok) expect(resent.data.id).toBe(first.data.id);
    expect(store.payments).toHaveLength(1);

    // The trail says the second send added nothing, so it cannot be read as
    // two collections of 5,000.
    const records = auditCalls.filter((entry) => entry.action === "payment.record");
    expect(records).toHaveLength(2);
    expect(records[1]?.summary).toMatch(/repeated send/);
    expect(records[0]?.summary).not.toMatch(/repeated send/);
  });
});

/* ─────────────── backdating and the closed day ─────────────── */

describe("backdating and day close (fix guide §2)", () => {
  /** Today's campus date, so nothing here depends on the machine clock's date. */
  const campusToday = () => kathmanduDayKey(new Date());
  const dayKeyAgo = (days: number) => kathmanduDayKey(new Date(Date.now() - days * 86400000));
  const CLOSED = "That day is closed. Ask an admin to reopen it.";

  it("refuses a receipt dated on a day that has been counted and shut", async () => {
    seedInvoice({ netAmount: 15000 });
    seedDayClosed("2026-11-05");

    const result = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: "2026-11-05" },
      "user-1"
    );

    expect(!result.ok && result.error).toBe(CLOSED);
    expect(store.payments).toHaveLength(0);
    // A refused receipt does not burn a number either.
    expect(store.counters["receipt:2026"] ?? 0).toBe(0);
  });

  it("refuses to void a receipt whose day is closed", async () => {
    seedInvoice({ netAmount: 15000, status: "PARTIAL" });
    // seedPayment lands at 2026-11-04T06:00Z, which is the 4th in Kathmandu.
    const receipt = seedPayment("inv-1", 5000);
    seedDayClosed("2026-11-04");

    const result = await voidPayment(receipt.id, "Mis-keyed amount", "user-2");

    expect(!result.ok && result.error).toBe(CLOSED);
    expect(store.payments[0]?.status).toBe("RECEIVED");
    expect(store.invoices[0]?.status).toBe("PARTIAL");
  });

  it("takes the receipt once the day is reopened", async () => {
    seedInvoice({ netAmount: 15000 });
    seedDayClosed("2026-11-05");

    expect((await reopenDay("2026-11-05")).ok).toBe(true);
    const result = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: "2026-11-05" },
      "user-1"
    );

    expect(result.ok).toBe(true);
    expect(store.payments).toHaveLength(1);
  });

  it("records the counted drawer next to the cash the system saw", async () => {
    seedInvoice({ netAmount: 15000 });
    await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: "2026-11-05" },
      "user-1"
    );
    await recordPayment(
      { invoiceId: "inv-1", amount: 2000, method: "ESEWA", receivedAt: "2026-11-05" },
      "user-1"
    );

    const closed = await closeDay(
      { day: "2026-11-05", cashCounted: 6000, note: "Deposit slip 44" },
      "user-9"
    );

    expect(closed.ok).toBe(true);
    if (!closed.ok) throw new Error(closed.error);
    // The drawer is a cash question; eSewa money is already in the bank.
    expect(closed.cashSystem).toBe(5000);
    expect(closed.difference).toBe(1000);

    const row = store.dayCloses[0];
    expect(row?.cashCounted).toBe(6000);
    expect(row?.note).toBe("Deposit slip 44");
    expect(row?.closedById).toBe("user-9");
    expect(row && row.day.getTime()).toBe(parseDateOnly("2026-11-05")!.getTime());
  });

  it("excludes a voided receipt from the cash it signs for", async () => {
    seedInvoice({ netAmount: 15000 });
    await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: "2026-11-05" },
      "user-1"
    );
    const mistake = await recordPayment(
      { invoiceId: "inv-1", amount: 1000, method: "CASH", receivedAt: "2026-11-05" },
      "user-1"
    );
    if (!mistake.ok) throw new Error(mistake.error);
    await voidPayment(mistake.id, "Entered twice", "user-2");

    const closed = await closeDay({ day: "2026-11-05", cashCounted: null, note: null }, "user-1");

    expect(closed.ok && closed.cashSystem).toBe(5000);
    // Counting is optional; the day closes on the system total with no difference claimed.
    expect(closed.ok && closed.difference).toBeNull();
  });

  it("will not close a day twice", async () => {
    seedDayClosed("2026-11-05");

    const twice = await closeDay({ day: "2026-11-05", cashCounted: 0, note: null }, "user-1");

    expect(!twice.ok && twice.error).toBe("That day is already closed.");
    expect(store.dayCloses).toHaveLength(1);
  });

  it("refuses to reopen a day that was never closed", async () => {
    const result = await reopenDay("2026-11-05");
    expect(!result.ok && result.error).toBe("That day is not closed.");
    expect(store.dayCloses).toHaveLength(0);
  });

  it("reports how much money a reopen puts back in play", async () => {
    seedInvoice({ netAmount: 15000 });
    await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: "2026-11-05" },
      "user-1"
    );
    await recordPayment(
      { invoiceId: "inv-1", amount: 3000, method: "CASH", receivedAt: "2026-11-05" },
      "user-1"
    );
    await closeDay({ day: "2026-11-05", cashCounted: 8000, note: null }, "user-1");

    const reopened = await reopenDay("2026-11-05");

    expect(reopened.ok && reopened.receipts).toBe(2);
    expect(store.dayCloses).toHaveLength(0);
    // Reopening reopens the day, it does not delete the money counted in it.
    expect(store.payments).toHaveLength(2);
  });

  it("keeps a clerk inside the Settings window", async () => {
    seedInvoice({ netAmount: 15000 });
    sessionState.role = "ACCOUNTANT";
    settingsState.maxBackdateDays = 3;

    const result = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CASH",
      receivedAt: dayKeyAgo(10),
      idempotencyKey: key(),
    });

    expect(!result.ok && result.error).toMatch(/older than 3 days/);
    expect(store.payments).toHaveLength(0);
  });

  it("reads the window from Settings instead of hard-coding it", async () => {
    seedInvoice({ netAmount: 15000 });
    settingsState.maxBackdateDays = 30;

    const result = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CASH",
      receivedAt: dayKeyAgo(10),
      idempotencyKey: key(),
    });

    expect(result.ok).toBe(true);
    expect(store.payments).toHaveLength(1);
  });

  it("leaves admins outside the window", async () => {
    seedInvoice({ netAmount: 15000 });
    sessionState.role = "SUPER_ADMIN";
    settingsState.maxBackdateDays = 0;

    const result = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CASH",
      receivedAt: dayKeyAgo(200),
      idempotencyKey: key(),
    });

    expect(result.ok).toBe(true);
    expect(store.payments).toHaveLength(1);
  });

  it("locks the day through the action and only an admin unlocks it", async () => {
    seedInvoice({ netAmount: 15000 });
    const day = campusToday();

    const collected = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CASH",
      receivedAt: day,
      idempotencyKey: key(),
    });
    expect(collected.ok).toBe(true);

    const closed = await closeDayAction({ day, cashCounted: "4800", note: "Short by 200" });
    expect(closed.ok).toBe(true);
    if (closed.ok) expect(closed.data.difference).toBe(-200);
    const closeEntry = auditCalls.find((entry) => entry.action === "fee.closeDay");
    expect(closeEntry?.summary).toMatch(/Closed .* counted NPR 4,800 against NPR 5,000/);
    // The audit says the shortfall in figures, so a later reader need not re-add it.
    expect(closeEntry?.meta).toMatchObject({ day, cashCounted: 4800, cashSystem: 5000, difference: -200 });

    const blocked = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "1000",
      method: "CASH",
      receivedAt: day,
      idempotencyKey: key(),
    });
    expect(!blocked.ok && blocked.error).toMatch(/day is closed/);
    // The one receipt from before the close is all the day holds.
    expect(store.payments).toHaveLength(1);

    sessionState.denied = ["fee.reopenDay"];
    const refused = await reopenDayAction({ day, reason: "A receipt was missed" });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error).toBe("You don't have permission to do that");
    expect(store.dayCloses).toHaveLength(1);

    sessionState.denied = [];
    const noReason = await reopenDayAction({ day });
    expect(noReason.ok).toBe(false);
    expect(!noReason.ok && noReason.fieldErrors?.reason?.[0]).toBeTruthy();

    // A counted day is reopened with a fresh code as well as a reason (task 2).
    const unproven = await reopenDayAction({ day, reason: "A receipt was missed" });
    expect(!unproven.ok && unproven.error).toBe(STEP_UP_REQUIRED);
    expect(store.dayCloses).toHaveLength(1);

    const reopened = await reopenDayAction({
      day,
      reason: "A receipt was missed",
      stepUpCode: "123456",
    });
    expect(reopened.ok).toBe(true);
    expect(store.dayCloses).toHaveLength(0);
    const reopenEntry = auditCalls.find((entry) => entry.action === "fee.reopenDay");
    expect(reopenEntry?.summary).toMatch(/Reopened/);
    expect(reopenEntry?.meta).toMatchObject({ day, reason: "A receipt was missed" });
  });

  it("refuses a close dialog that sends a date the book cannot use", async () => {
    const bad = await closeDayAction({ day: "5/11/2026", cashCounted: "100", note: "" });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.fieldErrors?.day?.[0]).toMatch(/2026-11-05/);
    expect(store.dayCloses).toHaveLength(0);
  });

  it("gives the close to the accountant and the reopen to the admins only", () => {
    expect(can("ACCOUNTANT", "fee.closeDay")).toBe(true);
    expect(can("ADMIN", "fee.closeDay")).toBe(true);
    expect(can("SUPER_ADMIN", "fee.closeDay")).toBe(true);
    expect(can("RECEPTION", "fee.closeDay")).toBe(false);
    expect(can("COUNSELOR", "fee.closeDay")).toBe(false);

    expect(can("ACCOUNTANT", "fee.reopenDay")).toBe(false);
    expect(can("ADMIN", "fee.reopenDay")).toBe(true);
    expect(can("SUPER_ADMIN", "fee.reopenDay")).toBe(true);
  });
});

/* ───────────────── the day lock (fix guide §2) ───────────────── */

/**
 * Closing a day is one decision made in two steps — read every receipt the day
 * holds, then write the row that says what the drawer contained — and a receipt
 * that arrives between the two steps makes the row a lie. There is no row to
 * lock for a day that has not been closed yet, so `lockDay` uses a Postgres
 * advisory lock on the day key, taken before the invoice row lock in every one of
 * the four writers. The fake client above queues the same key the database would,
 * which is what lets these tests see the interleaving the lock exists to prevent.
 */
describe("the day-close advisory lock", () => {
  const DAY = "2026-11-05";
  const NEXT_DAY = "2026-11-06";
  const DAY_LOCK = `dayclose:${DAY}`;
  const CLOSED = "That day is closed. Ask an admin to reopen it.";

  /** The cash a closed day can honestly claim: live cash receipts of that day. */
  const cashOnDay = (dayKey: string) =>
    store.payments
      .filter(
        (row) =>
          row.status === "RECEIVED" &&
          row.method === "CASH" &&
          kathmanduDayKey(row.receivedAt) === dayKey
      )
      .reduce((sum, row) => sum + row.amount, 0);

  it("never lets a receipt arrive between the count and the close", async () => {
    seedInvoice({ netAmount: 15000 });
    seedInvoice({ id: "inv-2", number: "INV-2026-00002", netAmount: 15000 });
    seedInvoice({ id: "inv-3", number: "INV-2026-00003", netAmount: 15000 });

    const [first, closed, second, third] = await Promise.all([
      recordPayment({ invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: DAY }, "user-1"),
      closeDay({ day: DAY, cashCounted: 5000, note: null }, "user-9"),
      recordPayment({ invoiceId: "inv-2", amount: 4000, method: "CASH", receivedAt: DAY }, "user-1"),
      recordPayment({ invoiceId: "inv-3", amount: 3000, method: "CASH", receivedAt: DAY }, "user-2"),
    ]);

    // Four writers, one day: all four queued on the same key, whoever came first.
    expect(store.dayLocksTaken).toEqual([DAY_LOCK, DAY_LOCK, DAY_LOCK, DAY_LOCK]);

    const receipts = [first, second, third];
    receipts
      .filter((result) => !result.ok)
      .forEach((result) => expect(!result.ok && result.error).toBe(CLOSED));
    // One close per day, whatever the order was.
    expect(store.dayCloses).toHaveLength(1);
    // The number the clerk signed for is the number the day actually holds.
    if (closed.ok) expect(closed.cashSystem).toBe(cashOnDay(DAY));
    // Money refused by the shut day is not in it either.
    expect(receipts.some((result) => !result.ok)).toBe(true);
    expect(cashOnDay(DAY)).toBeLessThan(12000);
  });

  it("takes the day lock before the invoice row lock", async () => {
    seedInvoice({ netAmount: 15000 });

    await recordPayment({ invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: DAY }, "user-1");
    expect(store.lockOrders.at(-1)).toEqual([`day:${DAY_LOCK}`, "invoice:inv-1"]);

    store.lockOrders.length = 0;
    await closeDay({ day: DAY, cashCounted: 5000, note: null }, "user-9");
    expect(store.lockOrders.at(-1)).toEqual([`day:${DAY_LOCK}`]);
  });

  it("will not void money out of a day that is being counted", async () => {
    seedInvoice({ netAmount: 15000, status: "PARTIAL" });
    // `seedPayment` lands on the 4th in Kathmandu, so that is the day to close.
    const receipt = seedPayment("inv-1", 5000);

    const [voided, closed] = await Promise.all([
      voidPayment(receipt.id, "Mis-keyed amount", "user-2"),
      closeDay({ day: "2026-11-04", cashCounted: 5000, note: null }, "user-9"),
    ]);

    // Either the void was inside the count or the day shut before it — the number
    // the clerk signed for and the money the day holds cannot disagree.
    if (!voided.ok) expect(voided.error).toBe(CLOSED);
    if (closed.ok) expect(closed.cashSystem).toBe(cashOnDay("2026-11-04"));
  });

  it("keeps two days independent and one day single-filed", async () => {
    seedInvoice({ netAmount: 15000 });
    seedInvoice({ id: "inv-2", number: "INV-2026-00002", netAmount: 15000 });

    const across = await Promise.all([
      recordPayment({ invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: DAY }, "user-1"),
      recordPayment({ invoiceId: "inv-2", amount: 4000, method: "CASH", receivedAt: NEXT_DAY }, "user-1"),
    ]);

    expect(across.every((result) => result.ok)).toBe(true);
    // Another day is another key: neither of these waited for the other.
    expect(store.dayLockWaits).toBe(0);
    expect(store.dayLocksTaken).toEqual([DAY_LOCK, `dayclose:${NEXT_DAY}`]);

    // The same day on two different bills does queue, which makes the assertion
    // above a fact about the key rather than about the fake.
    store.dayLocksTaken = [];
    store.dayLockWaits = 0;
    seedInvoice({ id: "inv-3", number: "INV-2026-00003", netAmount: 15000 });

    await Promise.all([
      recordPayment({ invoiceId: "inv-1", amount: 1000, method: "CASH", receivedAt: DAY }, "user-1"),
      recordPayment({ invoiceId: "inv-3", amount: 1000, method: "CASH", receivedAt: DAY }, "user-2"),
    ]);

    expect(store.dayLockWaits).toBe(1);
    expect(store.dayLocksTaken).toEqual([DAY_LOCK, DAY_LOCK]);
  });

  it("does not reopen a day while one of its receipts is still being written", async () => {
    seedInvoice({ netAmount: 15000 });
    seedDayClosed(DAY);

    const [payment, reopened] = await Promise.all([
      recordPayment({ invoiceId: "inv-1", amount: 5000, method: "CASH", receivedAt: DAY }, "user-1"),
      reopenDay(DAY),
    ]);

    expect(reopened.ok).toBe(true);
    // The receipt either saw a shut day and was refused, or ran after the reopen.
    // It cannot be written against a day it read as closed.
    if (!payment.ok) expect(payment.error).toBe(CLOSED);
    expect(store.payments).toHaveLength(payment.ok ? 1 : 0);
    expect(store.lockOrders.every((order) => order[0]?.startsWith("day:"))).toBe(true);
  });
});

describe("unique payment references (fix guide §3)", () => {
  it("refuses a second live receipt on one slip", async () => {
    seedInvoice({ netAmount: 15000 });

    const first = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "ESEWA", reference: "EW-8842" },
      "user-1"
    );
    const twice = await recordPayment(
      { invoiceId: "inv-1", amount: 1000, method: "ESEWA", reference: "EW-8842" },
      "user-2"
    );

    expect(first.ok).toBe(true);
    expect(!twice.ok && twice.error).toBe(DUPLICATE_REFERENCE);
    expect(store.payments).toHaveLength(1);
  });

  it("refuses the same slip even against another student's bill", async () => {
    seedInvoice({ netAmount: 15000 });
    seedInvoice({ id: "inv-2", number: "INV-2026-00002", netAmount: 8000 });

    await recordPayment({ invoiceId: "inv-1", amount: 5000, method: "KHALTI", reference: "KT-114" }, "user-1");
    const crossed = await recordPayment(
      { invoiceId: "inv-2", amount: 3000, method: "KHALTI", reference: "KT-114" },
      "user-1"
    );

    expect(!crossed.ok && crossed.error).toBe(DUPLICATE_REFERENCE);
    expect(store.invoices[1]?.status).toBe("ISSUED");
  });

  it("frees the reference once the receipt holding it is voided", async () => {
    seedInvoice({ netAmount: 15000 });

    const first = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "BANK_TRANSFER", reference: "SLIP-7" },
      "user-1"
    );
    if (!first.ok) throw new Error(first.error);
    await voidPayment(first.id, "Receipt typed against the wrong bill", "user-2");

    const reused = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "BANK_TRANSFER", reference: "SLIP-7" },
      "user-1"
    );

    expect(reused.ok).toBe(true);
    // The voided row stays with its number; only the live ones block the slip.
    expect(store.payments).toHaveLength(2);
    expect(store.payments[0]?.status).toBe("VOIDED");
  });

  it("reads one number as different money under different methods", async () => {
    seedInvoice({ netAmount: 15000 });

    const esewa = await recordPayment(
      { invoiceId: "inv-1", amount: 4000, method: "ESEWA", reference: "TID-991" },
      "user-1"
    );
    const khalti = await recordPayment(
      { invoiceId: "inv-1", amount: 4000, method: "KHALTI", reference: "TID-991" },
      "user-1"
    );

    expect(esewa.ok && khalti.ok).toBe(true);
    expect(store.payments).toHaveLength(2);
  });

  it("leaves cash out of it: no slip, and none to collide", async () => {
    seedInvoice({ netAmount: 15000 });

    const a = await recordPayment({ invoiceId: "inv-1", amount: 1000, method: "CASH" }, "user-1");
    const b = await recordPayment({ invoiceId: "inv-1", amount: 1000, method: "CASH" }, "user-2");

    expect(a.ok && b.ok).toBe(true);
    expect(store.payments).toHaveLength(2);
  });

  it("asks the clerk for the slip before it reaches the ledger", async () => {
    seedInvoice({ netAmount: 15000 });

    const result = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "BANK_TRANSFER",
      idempotencyKey: key(),
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors?.reference?.[0]).toMatch(/slip or transaction reference/);
    expect(store.payments).toHaveLength(0);
  });

  it("refuses the same slip through the action with the message a clerk can act on", async () => {
    seedInvoice({ netAmount: 15000 });

    const collected = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "ESEWA",
      reference: "EW-2210",
      idempotencyKey: key(),
    });
    expect(collected.ok).toBe(true);

    const replay = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "ESEWA",
      reference: "EW-2210",
      idempotencyKey: key(),
    });

    expect(!replay.ok && replay.error).toBe(DUPLICATE_REFERENCE);
    expect(store.payments).toHaveLength(1);
    expect(auditCalls.filter((entry) => entry.action === "payment.record")).toHaveLength(1);
  });

  it("still names the collision when a second clerk commits between the read and the write", async () => {
    seedInvoice({ netAmount: 15000 });
    await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "CHEQUE", reference: "CH-441" },
      "user-1"
    );

    // The pre-check sees a clear field because the other transaction had not
    // committed when it ran; the partial unique index is what settles it.
    store.blindNextReferenceCheck = true;
    const result = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "2000",
      method: "CHEQUE",
      reference: "CH-441",
      idempotencyKey: key(),
    });

    expect(!result.ok && result.error).toBe(DUPLICATE_REFERENCE);
    expect(store.payments).toHaveLength(1);
  });

  it("tells a reference collision apart from every other unique violation", () => {
    const withTarget = Object.assign(new Error("unique"), {
      code: "P2002",
      meta: { target: ["method", "reference"] },
    });
    const receiptNumber = Object.assign(new Error("unique"), {
      code: "P2002",
      meta: { target: ["receiptNo"] },
    });
    const serialisation = Object.assign(new Error("collision"), { code: "P2034" });

    expect(isDuplicateReferenceViolation(withTarget)).toBe(true);
    expect(isDuplicateReferenceViolation(receiptNumber)).toBe(false);
    expect(isDuplicateReferenceViolation(serialisation)).toBe(false);
    expect(isDuplicateReferenceViolation(new Error("anything else"))).toBe(false);
  });
});

/**
 * The unique index compares strings, so the ledger only recognises one slip when
 * one slip is stored one way: trimmed, inner runs of space folded to one space,
 * upper case. `prisma/migrations/20261106090000_payment_reference_normalized`
 * applies the same rule to the rows that predate it, which is why the two spellings
 * below collide instead of both being accepted.
 */
describe("reference normalisation", () => {
  it("folds case and spacing onto one spelling", () => {
    expect(normalizePaymentReference("txn1")).toBe("TXN1");
    expect(normalizePaymentReference("  TxN1\t")).toBe("TXN1");
    expect(normalizePaymentReference("kt  88 a")).toBe("KT 88 A");
    expect(normalizePaymentReference("EW-8842")).toBe("EW-8842");
    expect(normalizePaymentReference(null)).toBeNull();
    expect(normalizePaymentReference(undefined)).toBeNull();
    // A box of nothing is a missing slip, not a reference made of spaces.
    expect(normalizePaymentReference("   \t ")).toBeNull();
  });

  it("stores the normalised reference, not the typing the clerk left behind", () => {
    const parsed = recordPaymentSchema.safeParse({
      invoiceId: "inv-1",
      amount: "5000",
      method: "ESEWA",
      reference: " ew-8842 ",
      idempotencyKey: key(),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.reference).toBe("EW-8842");
  });

  it("still asks for the slip when the box holds only spaces", () => {
    const parsed = recordPaymentSchema.safeParse({
      invoiceId: "inv-1",
      amount: "5000",
      method: "ESEWA",
      reference: "  \t ",
      idempotencyKey: key(),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.find((issue) => issue.path[0] === "reference")?.message).toMatch(
        /slip or transaction reference/
      );
    }
  });

  it("reads TXN1, txn1 and “ txn1 ” as the one slip they are", async () => {
    seedInvoice({ netAmount: 15000 });

    const first = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "ESEWA", reference: "TXN1" },
      "user-1"
    );
    const lower = await recordPayment(
      { invoiceId: "inv-1", amount: 1000, method: "ESEWA", reference: "txn1" },
      "user-2"
    );
    const padded = await recordPayment(
      { invoiceId: "inv-1", amount: 1000, method: "ESEWA", reference: "  TxN1\t" },
      "user-2"
    );

    expect(first.ok).toBe(true);
    expect(!lower.ok && lower.error).toBe(DUPLICATE_REFERENCE);
    expect(!padded.ok && padded.error).toBe(DUPLICATE_REFERENCE);
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]?.reference).toBe("TXN1");
    expect(store.invoices[0]?.status).toBe("PARTIAL");
  });

  it("normalises a write that never passed the form", async () => {
    seedInvoice({ netAmount: 15000 });

    // A gateway credit calls the DAL directly, so the rule cannot live only in the
    // schema — an un-normalised row would slip past the index and block nothing.
    const result = await recordPayment(
      { invoiceId: "inv-1", amount: 5000, method: "KHALTI", reference: "kh  42 b" },
      "user-1"
    );

    expect(result.ok).toBe(true);
    expect(store.payments[0]?.reference).toBe("KH 42 B");
    const sameSlip = await recordPayment(
      { invoiceId: "inv-1", amount: 1000, method: "KHALTI", reference: " kh 42  b" },
      "user-2"
    );
    expect(!sameSlip.ok && sameSlip.error).toBe(DUPLICATE_REFERENCE);
  });

  it("frees the normalised slip for the corrected receipt", async () => {
    seedInvoice({ netAmount: 15000 });

    const first = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CHEQUE",
      reference: "ch 900",
      idempotencyKey: key(),
    });
    expect(first.ok).toBe(true);
    expect(store.payments[0]?.reference).toBe("CH 900");

    const collision = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CHEQUE",
      reference: " CH  900 ",
      idempotencyKey: key(),
    });
    expect(!collision.ok && collision.error).toBe(DUPLICATE_REFERENCE);

    if (!first.ok) throw new Error("unreachable");
    await voidPayment(first.data.id, "Cheque number typed wrong", "user-2");
    // The voided receipt leaves the index, so the same slip can back the corrected one.
    const corrected = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CHEQUE",
      reference: "ch 900",
      idempotencyKey: key(),
    });
    expect(corrected.ok).toBe(true);
    expect(store.payments.filter((row) => row.status === "RECEIVED")).toHaveLength(1);
    expect(store.payments.map((row) => row.reference)).toEqual(["CH 900", "CH 900"]);
  });
});

describe("drafting and issuing (docs 05 §9 test 2)", () => {
  it("mints the invoice number from the counter and starts as a draft", async () => {
    const result = await createInvoiceAction({
      studentId: "stu-1",
      enrollmentId: "enr-1",
      title: "Web Development fee",
      grossAmount: 15000,
      discountAmount: 0,
      dueDate: "2026-11-15",
    });

    expect(result.ok).toBe(true);
    expect(store.invoices[0]?.status).toBe("DRAFT");
    expect(store.invoices[0]?.number).toBe("INV-2026-00001");
    expect(store.counters["invoice:2026"]).toBe(1);
    expect(auditCalls.some((entry) => entry.action === "invoice.create")).toBe(true);
  });

  it("refuses a schedule that does not add up to the net fee", async () => {
    const result = await createInvoiceAction({
      studentId: "stu-1",
      title: "Web Development fee",
      grossAmount: 15000,
      discountAmount: 0,
      installments: [
        { seq: 1, amount: 5000, dueDate: "2026-11-15" },
        { seq: 2, amount: 5000, dueDate: "2026-12-15" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(store.invoices).toHaveLength(0);
  });

  it("refuses an instalment with no due date instead of filing it as due today", async () => {
    const result = await createInvoice({
      studentId: "stu-1",
      title: "Web Development fee",
      grossAmount: 10000,
      discountAmount: 0,
      installments: [{ seq: 1, amount: 10000, dueDate: null }],
    }, "user-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("needs a due date");
  });

  it("blocks a non-admin from issuing a discount over the threshold", async () => {
    settingsState.discountApprovalThresholdPct = 10;
    const drafted = await createInvoice(
      {
        studentId: "stu-1",
        title: "Web Development fee",
        grossAmount: 20000,
        discountAmount: 4000,
        installments: [],
      },
      "user-1"
    );
    expect(drafted.ok).toBe(true);
    if (!drafted.ok) return;

    const accountant = await issueInvoiceAction({ id: drafted.id });
    expect(!accountant.ok && accountant.error).toContain("needs an admin to issue this invoice");
    expect(store.invoices[0]?.status).toBe("DRAFT");

    sessionState.role = "ADMIN";
    const admin = await issueInvoiceAction({ id: drafted.id });
    expect(admin.ok).toBe(true);
    expect(store.invoices[0]?.status).toBe("ISSUED");
  });

  it("issues a draft once and refuses the second attempt", async () => {
    seedInvoice({ id: "inv-d", status: "DRAFT", number: "INV-2026-00009" });

    const first = await issueInvoice("inv-d");
    const second = await issueInvoice("inv-d");

    expect(first.ok).toBe(true);
    expect(!second.ok && second.error).toBe("Only a draft invoice can be issued");
  });

  it("refuses to void a bill that still holds money (N9)", async () => {
    seedInvoice({ id: "inv-v", netAmount: 5000 });
    const receipt = seedPayment("inv-v", 2000);

    const denied = await voidInvoice("inv-v", "Duplicate bill");
    expect(!denied.ok && denied.error).toBe(
      "Void its 1 receipt first — money already taken cannot belong to a dead bill"
    );
    expect(store.invoices[0]?.status).toBe("ISSUED");
    expect(store.payments[0]?.status).toBe("RECEIVED");

    // Undo the money first, and the bill is voidable. Its receipt stays as history.
    expect((await voidPayment(receipt.id, "Duplicate entry", "user-2")).ok).toBe(true);
    const voided = await voidInvoice("inv-v", "Duplicate bill");
    expect(voided.ok).toBe(true);
    expect(store.invoices[0]?.status).toBe("VOID");
    expect(store.payments).toHaveLength(1);

    const twice = await voidInvoice("inv-v", "Duplicate bill");
    expect(!twice.ok && twice.error).toBe("This invoice is already void");

    // A dead document takes no money (docs 05 §2).
    const payment = await recordPayment({ invoiceId: "inv-v", amount: 100, method: "CASH" }, "user-1");
    expect(!payment.ok && payment.error).toBe("This invoice is void");
  });

  it("counts every live receipt when guarding a void", async () => {
    seedInvoice({ id: "inv-v2", netAmount: 9000 });
    seedPayment("inv-v2", 1000);
    seedPayment("inv-v2", 2000);
    seedPayment("inv-v2", 500, "VOIDED");

    const denied = await voidInvoice("inv-v2", "Whole term billed twice");
    expect(!denied.ok && denied.error).toBe(
      "Void its 2 receipts first — money already taken cannot belong to a dead bill"
    );
  });
});

/* ───────────── the figure printed under a receipt ───────────── */

describe("balance after a receipt (N14)", () => {
  it("orders same-instant receipts by number, not by row id", async () => {
    seedInvoice({ id: "inv-b", netAmount: 9000 });
    // A back-dated entry: the first receipt of the day was keyed second, so it has
    // the larger row id but the smaller number. Campus-midnight stamping ties the
    // instants, so only the series says which money arrived first.
    const later = seedPayment("inv-b", 2000);
    const earlier = seedPayment("inv-b", 1000);
    earlier.receiptNo = "RCPT-2026-00001";
    later.receiptNo = "RCPT-2026-00002";

    const paid = await getBalanceAfterReceipt({
      invoiceId: "inv-b",
      receiptNo: later.receiptNo,
      receivedAt: later.receivedAt,
      status: "RECEIVED",
    });
    // Only RCPT-...-00001 (1000) preceded it — ordering by id would count nothing.
    expect(paid).toBe(8000);

    const first = await getBalanceAfterReceipt({
      invoiceId: "inv-b",
      receiptNo: earlier.receiptNo,
      receivedAt: earlier.receivedAt,
      status: "RECEIVED",
    });
    expect(first).toBe(9000);
  });

  it("prints the balance as it stands for a receipt that was undone", async () => {
    seedInvoice({ id: "inv-c", netAmount: 9000 });
    const kept = seedPayment("inv-c", 4000);
    seedPayment("inv-c", 1000, "VOIDED");

    expect(
      await getBalanceAfterReceipt({
        invoiceId: "inv-c",
        receiptNo: kept.receiptNo,
        receivedAt: kept.receivedAt,
        status: "VOIDED",
      })
    ).toBe(5000);
  });
});

/* ───────────────────── who may do it ───────────────────── */

describe("role matrix (docs 05 §9 test 4)", () => {
  it("lets reception take money but never undo it", () => {
    expect(can("RECEPTION", "fee.read")).toBe(true);
    expect(can("RECEPTION", "payment.record")).toBe(true);
    expect(can("RECEPTION", "payment.void")).toBe(false);
    expect(can("RECEPTION", "invoice.void")).toBe(false);
    expect(can("RECEPTION", "fee.write")).toBe(false);
  });

  it("gives the accountant the ledger but not the veto", () => {
    expect(can("ACCOUNTANT", "fee.write")).toBe(true);
    expect(can("ACCOUNTANT", "invoice.issue")).toBe(true);
    expect(can("ACCOUNTANT", "payment.void")).toBe(false);
    expect(can("ACCOUNTANT", "invoice.void")).toBe(false);
  });

  it("keeps fees out of a counselor's and an instructor's reach", () => {
    for (const role of ["COUNSELOR", "INSTRUCTOR"] as const) {
      expect(can(role, "fee.read")).toBe(false);
      expect(can(role, "fee.write")).toBe(false);
      expect(can(role, "payment.record")).toBe(false);
    }
  });

  it("refuses the action itself, not only the page", async () => {
    seedInvoice({ netAmount: 15000 });
    const receipt = seedPayment("inv-1", 5000);
    sessionState.role = "RECEPTION";
    sessionState.denied = ["payment.void"];

    // A code is offered and still does not help: the permission is the refusal,
    // and the second factor cannot buy a right the role matrix never granted.
    const result = await voidPaymentAction({
      id: receipt.id,
      reason: "Wrong amount",
      stepUpCode: "123456",
    });
    expect(!result.ok && result.error).toBe("You don't have permission to do that");
    expect(store.payments[0]?.status).toBe("RECEIVED");
    expect(twoFactorState.totpCalls).toBe(0);
  });
});

/* ─────────────────── the second factor ─────────────────── */

/**
 * Task 2: undoing money is confirmed at the moment of the click, not by a session
 * opened hours earlier. These run the real `requireStepUp()` against a stand-in
 * Better Auth, and check both halves of the promise — a void that cannot be
 * reached without a code, and a receipt-taking that still takes one click.
 */
describe("step-up on a void (task 2)", () => {
  beforeEach(() => {
    sessionState.role = "SUPER_ADMIN";
  });

  it("refuses a void that arrives without a code", async () => {
    seedInvoice();
    const receipt = seedPayment("inv-1", 5000);

    const result = await voidPaymentAction({ id: receipt.id, reason: "Wrong amount" });

    expect(!result.ok && result.error).toBe(STEP_UP_REQUIRED);
    expect(store.payments[0]?.status).toBe("RECEIVED");
    // An empty box is not a guess, so it is never sent to the verifier.
    expect(twoFactorState.totpCalls).toBe(0);
    expect(auditCalls.map((entry) => entry.action)).not.toContain("payment.void");
  });

  it("refuses a code too short to be one", async () => {
    seedInvoice();
    const receipt = seedPayment("inv-1", 5000);

    const result = await voidPaymentAction({
      id: receipt.id,
      reason: "Wrong amount",
      stepUpCode: "12345",
    });

    expect(!result.ok && result.error).toBe(STEP_UP_CODE_MESSAGE);
    expect(store.payments[0]?.status).toBe("RECEIVED");
  });

  it("refuses a wrong code and leaves the receipt standing", async () => {
    seedInvoice();
    const receipt = seedPayment("inv-1", 5000);
    twoFactorState.failWith = "INVALID_CODE";

    const result = await voidPaymentAction({
      id: receipt.id,
      reason: "Wrong amount",
      stepUpCode: "111111",
    });

    expect(twoFactorState.totpCalls).toBe(1);
    expect(!result.ok && result.error).toBe(
      "That code is not valid right now. Codes expire after 30 seconds."
    );
    expect(store.payments[0]?.status).toBe("RECEIVED");
    expect(auditCalls.map((entry) => entry.action)).not.toContain("payment.void");
  });

  it("voids with a verified code and records which factor was spent", async () => {
    seedInvoice();
    const receipt = seedPayment("inv-1", 5000);

    const result = await voidPaymentAction({
      id: receipt.id,
      reason: "Duplicate slip",
      stepUpCode: "123456",
      stepUpMethod: "totp",
    });

    expect(result.ok).toBe(true);
    expect(store.payments[0]?.status).toBe("VOIDED");
    const stepUpEntry = auditCalls.find((entry) => entry.action === "auth.2fa.stepUp");
    expect(stepUpEntry?.meta).toEqual({ purpose: "payment.void", method: "totp" });
    // The digits themselves never reach the trail.
    expect(JSON.stringify(auditCalls)).not.toContain("123456");
    expect(auditCalls.some((entry) => entry.action === "payment.void")).toBe(true);
  });

  it("sends a backup code to the backup verifier", async () => {
    seedInvoice();
    const receipt = seedPayment("inv-1", 5000);

    const result = await voidPaymentAction({
      id: receipt.id,
      reason: "Duplicate slip",
      stepUpCode: "ABCDE-FGHIJ",
      stepUpMethod: "backup",
    });

    expect(result.ok).toBe(true);
    expect(twoFactorState.backupCalls).toBe(1);
    expect(twoFactorState.totpCalls).toBe(0);
  });

  it("voids an invoice the same way", async () => {
    seedInvoice();

    const withoutCode = await voidInvoiceAction({ id: "inv-1", reason: "Billed twice" });
    expect(!withoutCode.ok && withoutCode.error).toBe(STEP_UP_REQUIRED);
    expect(store.invoices[0]?.status).toBe("ISSUED");

    const withCode = await voidInvoiceAction({
      id: "inv-1",
      reason: "Billed twice",
      stepUpCode: "123456",
    });
    expect(withCode.ok).toBe(true);
    expect(store.invoices[0]?.status).toBe("VOID");
  });

  it("keeps closing a day one-click and demands a code to reopen it", async () => {
    seedInvoice();
    const day = kathmanduDayKey(new Date());
    await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CASH",
      receivedAt: day,
      idempotencyKey: key(),
    });

    // Closing adds control over the day, so it stays the one-click action it was.
    const closed = await closeDayAction({ day, cashCounted: "5000", note: "" });
    expect(closed.ok).toBe(true);
    expect(twoFactorState.totpCalls).toBe(0);

    // A wrong code is the only thing charged to the sign-in budget.
    twoFactorState.failWith = "INVALID_CODE";
    const wrong = await reopenDayAction({
      day,
      reason: "A slip was missed",
      stepUpCode: "111111",
    });
    expect(!wrong.ok && wrong.error).toMatch(/not valid right now/);
    expect(guardState.scope).toBe("staff-2fa");
    expect(guardState.failures).toBe(1);
    expect(store.dayCloses).toHaveLength(1);

    twoFactorState.failWith = null;
    const right = await reopenDayAction({
      day,
      reason: "A slip was missed",
      stepUpCode: "123456",
    });
    expect(right.ok).toBe(true);
    expect(store.dayCloses).toHaveLength(0);
    // The good code charged nothing to the same budget.
    expect(guardState.failures).toBe(1);
    const stepUpEntry = auditCalls.find((entry) => entry.action === "auth.2fa.stepUp");
    expect(stepUpEntry?.meta).toEqual({ purpose: "day.reopen", method: "totp" });
    expect(JSON.stringify(auditCalls)).not.toContain("123456");
  });

  it("tells an unenrolled clerk to set one up first", async () => {
    seedInvoice();
    const receipt = seedPayment("inv-1", 5000);
    sessionState.twoFactorEnabled = false;

    const result = await voidPaymentAction({
      id: receipt.id,
      reason: "Wrong amount",
      stepUpCode: "123456",
    });

    expect(!result.ok && result.error).toBe(STEP_UP_NOT_ENROLLED);
    expect(store.payments[0]?.status).toBe("RECEIVED");
  });

  it("leaves taking money at the counter a one-click action", async () => {
    // The gate is on undoing, not on the receipt the counter prints all day.
    seedInvoice();

    const result = await recordPaymentAction({
      invoiceId: "inv-1",
      amount: "5000",
      method: "CASH",
      idempotencyKey: key(),
    });

    expect(result.ok).toBe(true);
    expect(twoFactorState.totpCalls).toBe(0);
  });
});

/* ─────────────── the dues summary aggregate (perf task 5) ─────────────── */

describe("the dues aging aggregate", () => {
  // Midday in Kathmandu on 5 November, chosen so the day key is unambiguous.
  const NOW = new Date("2026-11-05T06:30:00Z");

  /** What the summary said when it counted in JavaScript, invoice by invoice. */
  const countedInJs = () => {
    const buckets: Record<string, number> = {
      CURRENT: 0,
      OVERDUE_1_7: 0,
      OVERDUE_8_30: 0,
      OVERDUE_30_PLUS: 0,
      UNDATED: 0,
    };
    let outstanding = 0;
    let overdueCount = 0;
    let overdueAmount = 0;

    for (const invoice of store.invoices) {
      if (invoice.status !== "ISSUED" && invoice.status !== "PARTIAL") continue;
      const paid = store.payments
        .filter((row) => row.invoiceId === invoice.id && row.status === "RECEIVED")
        .reduce((sum, row) => sum + row.amount, 0);
      const balance = invoiceBalance(invoice.netAmount, paid);
      outstanding += balance;
      const aging = agingOf(invoice.dueDate, NOW);
      buckets[aging.bucket] += 1;
      if (aging.daysOverdue && aging.daysOverdue > 0) {
        overdueCount += 1;
        overdueAmount += balance;
      }
    }

    return { outstanding, overdueCount, overdueAmount, buckets };
  };

  /** One bill in every bucket, both boundary days hit, plus bills that must not count. */
  const seedLedger = () => {
    seedInvoice({ id: "inv-future", dueDate: new Date("2026-12-01T00:00:00Z"), netAmount: 9000 });
    seedInvoice({ id: "inv-today", dueDate: new Date("2026-11-05T00:00:00Z"), netAmount: 5000 });
    seedInvoice({ id: "inv-yesterday", dueDate: new Date("2026-11-04T00:00:00Z"), netAmount: 4000 });
    seedInvoice({ id: "inv-week", dueDate: new Date("2026-10-29T00:00:00Z"), netAmount: 12000 });
    seedInvoice({ id: "inv-week-plus", dueDate: new Date("2026-10-28T00:00:00Z"), netAmount: 8000 });
    seedInvoice({ id: "inv-month", dueDate: new Date("2026-10-06T00:00:00Z"), netAmount: 7000 });
    seedInvoice({ id: "inv-ancient", dueDate: new Date("2026-10-05T00:00:00Z"), netAmount: 3000 });
    seedInvoice({ id: "inv-undated", dueDate: null, netAmount: 2000 });
    seedInvoice({ id: "inv-paid", status: "PAID", dueDate: new Date("2026-10-01T00:00:00Z") });
    seedInvoice({ id: "inv-draft", status: "DRAFT", dueDate: new Date("2026-09-01T00:00:00Z") });
    seedPayment("inv-yesterday", 1500);
    seedPayment("inv-ancient", 1000, "VOID");
  };

  it("answers with the same figures the loop produced", async () => {
    seedLedger();

    await expect(getDuesSummary(NOW)).resolves.toEqual(countedInJs());
  });

  it("counts the buckets, the voids and the closed bills the way the page shows them", async () => {
    seedLedger();

    const summary = await getDuesSummary(NOW);

    // 9000 + 5000 + (4000-1500) + 12000 + 8000 + 7000 + 3000 + 2000
    expect(summary.outstanding).toBe(48500);
    // the five strictly-overdue bills; due today and undated are not overdue
    expect(summary.overdueCount).toBe(5);
    expect(summary.overdueAmount).toBe(32500);
    expect(summary.buckets).toEqual({
      CURRENT: 2,
      "OVERDUE_1_7": 2,
      "OVERDUE_8_30": 2,
      "OVERDUE_30_PLUS": 1,
      UNDATED: 1,
    });
    expect(summary.buckets).toHaveProperty("OVERDUE_8_30");
  });

  it("names the bucket a bill falls in exactly where agingOf() draws the line", async () => {
    const boundaries = [
      "2026-12-01",
      "2026-11-05",
      "2026-11-04",
      "2026-10-30",
      "2026-10-29",
      "2026-10-28",
      "2026-10-07",
      "2026-10-06",
      "2026-10-05",
      "2026-07-01",
    ];
    boundaries.forEach((due, index) =>
      seedInvoice({ id: `inv-${index}`, dueDate: new Date(`${due}T00:00:00Z`), netAmount: 1000 })
    );

    const summary = await getDuesSummary(NOW);
    const expected = countedInJs();

    expect(summary.buckets).toEqual(expected.buckets);
    // Each bucket keeps its last day: the 29th is 7 days late, not 8.
    expect(summary.buckets["OVERDUE_1_7"]).toBe(3);
    expect(summary.buckets["OVERDUE_8_30"]).toBe(3);
    expect(summary.buckets["OVERDUE_30_PLUS"]).toBe(2);
    expect(summary.buckets.CURRENT).toBe(2);
  });

  it("asks PostgreSQL with date text, never a zone-less timestamp", () => {
    const query = duesAgingQuery("2026-11-05", "2026-10-29", "2026-10-06", ["ISSUED", "PARTIAL"]);
    const sql = query.strings.join(" ");

    expect(query.values.slice(0, 3)).toEqual([
      "2026-11-05",
      "2026-10-29",
      "2026-10-06",
    ]);
    expect(sql).toContain("::date");
    expect(sql).toContain("WHERE status = 'RECEIVED'");
    expect(sql).toContain("GROUP BY 1");
  });

  it("still answers every bucket when the ledger is empty", async () => {
    await expect(getDuesSummary(NOW)).resolves.toEqual({
      outstanding: 0,
      overdueCount: 0,
      overdueAmount: 0,
      buckets: {
        CURRENT: 0,
        "OVERDUE_1_7": 0,
        "OVERDUE_8_30": 0,
        "OVERDUE_30_PLUS": 0,
        UNDATED: 0,
      },
    });
  });
});
