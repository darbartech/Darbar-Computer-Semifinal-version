import "server-only";
import { nepalYear } from "@/lib/dates";
import { nextSequence, peekSequence, type Tx } from "@/server/dal/counters";

/**
 * Human-readable document numbers (docs 05 §1). Both series come from `Counter`,
 * never from `max(...) + 1`, so two clerks working at once cannot be promised the
 * same number. A rolled-back transaction burns a number and leaves a gap; for
 * invoices and receipts the number has to be unique and ordered, not dense.
 */

export const INVOICE_NUMBER_PREFIX = "INV";
export const RECEIPT_NUMBER_PREFIX = "RCPT";

const SEQUENCE_PADDING = 5;
const MAX_ANNUAL_SEQUENCE = 99_999;

function documentNumber(prefix: string, year: number, sequence: number, label: string): string {
  if (!Number.isSafeInteger(sequence) || sequence > MAX_ANNUAL_SEQUENCE) {
    throw new Error(`${label} sequence exhausted for ${year}`);
  }
  return `${prefix}-${year}-${String(sequence).padStart(SEQUENCE_PADDING, "0")}`;
}

export async function generateInvoiceNumber(
  year: number = nepalYear(),
  tx?: Tx
): Promise<string> {
  const sequence = await nextSequence(`invoice:${year}`, tx);
  return documentNumber(INVOICE_NUMBER_PREFIX, year, sequence, "Invoice number");
}

export async function generateReceiptNumber(
  year: number = nepalYear(),
  tx?: Tx
): Promise<string> {
  const sequence = await nextSequence(`receipt:${year}`, tx);
  return documentNumber(RECEIPT_NUMBER_PREFIX, year, sequence, "Receipt number");
}

/** Preview only — rendering a draft must not consume the year's numbers. */
export async function peekInvoiceNumber(year: number = nepalYear()): Promise<string> {
  return documentNumber(
    INVOICE_NUMBER_PREFIX,
    year,
    (await peekSequence(`invoice:${year}`)) + 1,
    "Invoice number"
  );
}
