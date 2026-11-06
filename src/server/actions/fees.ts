"use server";
import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { requirePermission, isRedirectError } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import { notifyVoided } from "@/server/services/void-alerts";
import { getSiteSettings } from "@/server/dal/settings";
import {
  createInvoice,
  getInvoiceAmounts,
  issueInvoice,
  recordPayment,
  voidInvoice,
  voidPayment,
  closeDay,
  reopenDay,
  DUPLICATE_REFERENCE,
  isDuplicateReferenceViolation,
  type DayCloseWriteResult,
  type PaymentWriteResult,
  type VoidPaymentResult,
} from "@/server/dal/fees";
import { needsDiscountApproval } from "@/server/services/fees";
import { reportError } from "@/server/services/monitoring";
import { requireStepUp } from "@/server/services/step-up";
import { isRetryableTransactionFailure, retryOnUniqueViolation } from "@/server/dal/counters";
import { FEE_TAGS, invoiceWriteTags, paymentWriteTags, invalidate } from "@/server/revalidate";
import {
  closeDaySchema,
  createInvoiceSchema,
  invoiceIdSchema,
  recordPaymentSchema,
  reopenDaySchema,
  voidInvoiceSchema,
  voidPaymentSchema,
} from "@/lib/validators/fees";

/**
 * Fees & payments actions (docs 05 §2-§3). Every one of them follows the house
 * shape — `requirePermission` → Zod → DAL transaction → audit → invalidate →
 * ActionResult — and every money number is derived inside the DAL transaction,
 * never taken from what the browser submitted.
 */

export type FeeActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const NO_PERMISSION = "You don't have permission to do that";

/**
 * Roles that may date a receipt outside the Settings backdating window
 * (fix guide §2). Everyone else is limited so a counted day cannot be edited.
 */
const BACKDATE_EXEMPT: readonly string[] = ["ADMIN", "SUPER_ADMIN"];

function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message.includes("FORBIDDEN");
}

/**
 * Docs 05 §3 asks for exactly one retry of a transaction Postgres aborted, which
 * `retryOnUniqueViolation` provides. `isRetryableTransactionFailure` recognises both
 * shapes the abort arrives in, so a clerk is never shown a failure for a receipt the
 * database rolled back cleanly.
 */

function invalid(error: z.ZodError): FeeActionResult<never> {
  return {
    ok: false,
    error: "Please fix the highlighted fields",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function fail(label: string, error: unknown): FeeActionResult<never> {
  if (isRedirectError(error)) throw error;
  if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
  // Amounts and ids only: a fee error can name an invoice, never a student's
  // contact details (docs 08 §1 / docs 09: no personal data in logs).
  console.error(`[${label}]`, error instanceof Error ? error.message : "unknown");
  // The money actions all answer with this one generic string, so this is the
  // only place a failure can be seen at all: a receipt that did not record is
  // invisible to the clerk and to `onRequestError`, which never gets here.
  reportError(error, label);
  return { ok: false, error: GENERIC_FAILURE };
}

/* ───────────────────────── invoices ───────────────────────── */

/**
 * Save a draft bill. Anyone with `fee.write` may prepare it — the discount gate
 * sits on issuing, so the maker/checker split in docs 05 §2 survives here.
 */
export async function createInvoiceAction(
  input: unknown
): Promise<FeeActionResult<{ id: string; number: string }>> {
  try {
    const user = await requirePermission("fee.write");
    const actor: AuditActor = { id: user.id, email: user.email };

    const parsed = createInvoiceSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const result = await createInvoice(parsed.data, user.id);
    if (!result.ok) return { ok: false, error: result.error };

    await audit({
      actor,
      action: "invoice.create",
      entity: "Invoice",
      entityId: result.id,
      summary: `Drafted ${result.number}`,
      // Gross/discount/net only — no student name, code or contact data.
      meta: {
        number: result.number,
        grossAmount: parsed.data.grossAmount,
        discountAmount: parsed.data.discountAmount,
      },
    });

    invalidate(...invoiceWriteTags(result.id));
    return { ok: true, data: { id: result.id, number: result.number } };
  } catch (error) {
    return fail("createInvoiceAction", error);
  }
}

/**
 * DRAFT → ISSUED, the moment it becomes a bill. A discount over the configured
 * share (Settings → Fees) may only be issued by an ADMIN: whoever prepared the
 * draft cannot approve their own reduction (docs 05 §2).
 */
export async function issueInvoiceAction(
  input: unknown
): Promise<FeeActionResult<{ id: string; status: string }>> {
  try {
    const user = await requirePermission("invoice.issue");
    const actor: AuditActor = { id: user.id, email: user.email };

    const parsed = invoiceIdSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const invoice = await getInvoiceAmounts(parsed.data.id);
    if (!invoice) return { ok: false, error: "Invoice not found" };

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      const { fees } = await getSiteSettings();
      if (
        needsDiscountApproval(
          invoice.grossAmount,
          invoice.discountAmount,
          fees.discountApprovalThresholdPct
        )
      ) {
        return {
          ok: false,
          error: `A discount over ${fees.discountApprovalThresholdPct}% needs an admin to issue this invoice`,
        };
      }
    }

    const result = await issueInvoice(parsed.data.id);
    if (!result.ok) return { ok: false, error: result.error };

    await audit({
      actor,
      action: "invoice.issue",
      entity: "Invoice",
      entityId: result.id,
      summary: `Issued ${result.number}`,
      meta: { number: result.number, status: result.status },
    });

    invalidate(...invoiceWriteTags(result.id));
    return { ok: true, data: { id: result.id, status: result.status } };
  } catch (error) {
    return fail("issueInvoiceAction", error);
  }
}

/**
 * Void an invoice. Its receipts stay in the ledger; the reason is required.
 * Task 2: a void deletes a customer's debt from the books, so it also asks the
 * signed-in admin for a fresh authenticator code.
 */
export async function voidInvoiceAction(
  input: unknown
): Promise<FeeActionResult<{ id: string }>> {
  try {
    const user = await requirePermission("invoice.void");
    const actor: AuditActor = { id: user.id, email: user.email };

    const parsed = voidInvoiceSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    // The raw payload, not `parsed.data`: Zod strips the two step-up fields off the
    // business object it validates.
    const stepUp = await requireStepUp(user, "invoice.void", input);
    if (!stepUp.ok) return { ok: false, error: stepUp.error };

    const result = await voidInvoice(parsed.data.id, parsed.data.reason);
    if (!result.ok) return { ok: false, error: result.error };

    await audit({
      actor,
      action: "invoice.void",
      entity: "Invoice",
      entityId: result.id,
      summary: `Voided ${result.number}`,
      meta: { number: result.number, reason: parsed.data.reason },
    });

    invalidate(...invoiceWriteTags(result.id));
    after(() =>
      notifyVoided({
        kind: "invoice",
        id: result.id,
        reason: parsed.data.reason,
        byEmail: user.email,
      })
    );
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    return fail("voidInvoiceAction", error);
  }
}

/* ───────────────────────── payments ───────────────────────── */

/**
 * Take money. Serializable + one retry (docs 05 §3): two clerks who both see a
 * balance of 5,000 and both enter 5,000 cannot both land.
 */
export async function recordPaymentAction(
  input: unknown
): Promise<FeeActionResult<{ id: string; receiptNo: string; balance: number; invoiceStatus: string }>> {
  try {
    const user = await requirePermission("payment.record");
    const actor: AuditActor = { id: user.id, email: user.email };

    const parsed = recordPaymentSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    // Fix guide §2. A receipt dated months back rewrites a day book that has
    // already been counted, so the window in Settings is the clerk's limit and
    // anything older is an admin's call. Kathmandu noon, because a day key parsed
    // at midnight in the server's own zone can land on the day before.
    if (parsed.data.receivedAt && !BACKDATE_EXEMPT.includes(user.role)) {
      const { fees } = await getSiteSettings();
      const limitDays = fees.maxBackdateDays;
      const when = new Date(`${parsed.data.receivedAt}T12:00:00+05:45`).getTime();
      if (Date.now() - when > limitDays * 24 * 60 * 60 * 1000) {
        return {
          ok: false,
          error: `Only an admin can record a payment older than ${limitDays} days`,
        };
      }
    }

    let result: PaymentWriteResult;
    try {
      result = await retryOnUniqueViolation(
        () => recordPayment(parsed.data, user.id),
        isRetryableTransactionFailure
      );
    } catch (error) {
      // Two clerks can both find one slip unused and both insert; the partial unique
      // index picks the winner and the loser is told what it collided with
      // (fix guide §3) instead of a generic failure.
      if (isDuplicateReferenceViolation(error)) {
        return { ok: false, error: DUPLICATE_REFERENCE };
      }
      throw error;
    }
    if (!result.ok) return { ok: false, error: result.error };

    await audit({
      actor,
      action: "payment.record",
      entity: "Payment",
      entityId: result.id,
      // A second send of one dialog opens is not a second payment; say so in the
      // trail rather than leaving two indistinguishable collections (fix guide §1).
      summary: result.replayed
        ? `Receipt ${result.receiptNo} (repeated send, nothing added)`
        : `Receipt ${result.receiptNo}`,
      // Docs 05 §3: the audit trail carries the amount and method, nothing else.
      meta: { receiptNo: result.receiptNo, amount: parsed.data.amount, method: parsed.data.method },
    });

    invalidate(...paymentWriteTags({ invoiceId: result.invoiceId, paymentId: result.id }));
    return {
      ok: true,
      data: {
        id: result.id,
        receiptNo: result.receiptNo,
        balance: result.balance,
        invoiceStatus: result.invoiceStatus,
      },
    };
  } catch (error) {
    return fail("recordPaymentAction", error);
  }
}

/**
 * Count the drawer and shut one campus day (fix guide §2). What came in is
 * recorded next to what the system thinks came in, so the difference is on the
 * record rather than in somebody's memory.
 */
export async function closeDayAction(
  input: unknown
): Promise<FeeActionResult<{ day: string; cashSystem: number; difference: number | null }>> {
  try {
    const user = await requirePermission("fee.closeDay");
    const actor: AuditActor = { id: user.id, email: user.email };

    const parsed = closeDaySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const result: DayCloseWriteResult = await closeDay(
      {
        day: parsed.data.day,
        cashCounted: parsed.data.cashCounted,
        note: parsed.data.note ?? null,
      },
      user.id
    );
    if (!result.ok) return { ok: false, error: result.error };

    await audit({
      actor,
      action: "fee.closeDay",
      entity: "DayClose",
      entityId: result.id,
      // Amounts and a day only — no student, no clerk name (docs 08 §1).
      summary:
        result.difference === null
          ? `Closed ${result.day} — cash not counted (${formatAmount(result.cashSystem)} in the ledger)`
          : `Closed ${result.day} — counted ${formatAmount(result.cashCounted)} against ${formatAmount(result.cashSystem)}`,
      meta: {
        day: result.day,
        cashCounted: result.cashCounted,
        cashSystem: result.cashSystem,
        difference: result.difference,
      },
    });

    invalidate(...FEE_TAGS);
    return {
      ok: true,
      data: { day: result.day, cashSystem: result.cashSystem, difference: result.difference },
    };
  } catch (error) {
    return fail("closeDayAction", error);
  }
}

/**
 * Reopen a closed day. Deliberately needs `fee.reopenDay`: once the day is open
 * again, receipts can land in money that has already been handed over, so the
 * reason is mandatory and the event is audited (fix guide §2).
 */
export async function reopenDayAction(
  input: unknown
): Promise<FeeActionResult<{ day: string; receipts: number }>> {
  try {
    const user = await requirePermission("fee.reopenDay");
    const actor: AuditActor = { id: user.id, email: user.email };

    const parsed = reopenDaySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    // A counted day is the one number the institute trusts: reopening it lets
    // receipts land in money that has already been handed over, so the reason is
    // mandatory, the event is audited, and the click is confirmed with a fresh
    // code (task 2). Closing a day stays one-click — it is the act that adds
    // control, not the one that removes it.
    const stepUp = await requireStepUp(user, "day.reopen", input);
    if (!stepUp.ok) return { ok: false, error: stepUp.error };

    const result = await reopenDay(parsed.data.day);
    if (!result.ok) return { ok: false, error: result.error };

    await audit({
      actor,
      action: "fee.reopenDay",
      entity: "DayClose",
      summary: `Reopened ${parsed.data.day} — ${result.receipts} receipt(s) exposed`,
      meta: { day: parsed.data.day, reason: parsed.data.reason, receipts: result.receipts },
    });

    invalidate(...FEE_TAGS);
    return { ok: true, data: { day: parsed.data.day, receipts: result.receipts } };
  } catch (error) {
    return fail("reopenDayAction", error);
  }
}

/** NPR in a plain digit string for the audit trail, never a student's details. */
function formatAmount(amount: number | null): string {
  return amount === null ? "—" : `NPR ${amount.toLocaleString("en-IN")}`;
}

/**
 * A voided receipt moves money back out of a counted day, so it carries the same
 * fresh second factor as the invoice void above (task 2).
 */
export async function voidPaymentAction(
  input: unknown
): Promise<FeeActionResult<{ invoiceId: string; balance: number; invoiceStatus: string }>> {
  try {
    const user = await requirePermission("payment.void");
    const actor: AuditActor = { id: user.id, email: user.email };

    const parsed = voidPaymentSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const stepUp = await requireStepUp(user, "payment.void", input);
    if (!stepUp.ok) return { ok: false, error: stepUp.error };

    const result: VoidPaymentResult = await retryOnUniqueViolation(
      () => voidPayment(parsed.data.id, parsed.data.reason, user.id),
      isRetryableTransactionFailure
    );
    if (!result.ok) return { ok: false, error: result.error };

    await audit({
      actor,
      action: "payment.void",
      entity: "Payment",
      entityId: parsed.data.id,
      summary: "Voided a receipt",
      meta: { reason: parsed.data.reason },
    });

    invalidate(
      ...paymentWriteTags({ invoiceId: result.invoiceId, paymentId: parsed.data.id })
    );
    after(() =>
      notifyVoided({
        kind: "receipt",
        id: parsed.data.id,
        reason: parsed.data.reason,
        byEmail: user.email,
      })
    );
    return {
      ok: true,
      data: {
        invoiceId: result.invoiceId,
        balance: result.balance,
        invoiceStatus: result.invoiceStatus,
      },
    };
  } catch (error) {
    return fail("voidPaymentAction", error);
  }
}
