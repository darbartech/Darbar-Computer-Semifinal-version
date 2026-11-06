import "server-only";
import { randomBytes } from "node:crypto";
import { nepalYear } from "@/lib/dates";
import { nextSequence, peekSequence, type Tx } from "@/server/dal/counters";

export const CERTIFICATE_NUMBER_PREFIX = "DT-CERT";
const SEQUENCE_PADDING = 5;
const MAX_ANNUAL_SEQUENCE = 99_999;

function certificateNumber(year: number, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence > MAX_ANNUAL_SEQUENCE) {
    throw new Error("Certificate number sequence exhausted for this year");
  }
  return `${CERTIFICATE_NUMBER_PREFIX}-${year}-${String(sequence).padStart(
    SEQUENCE_PADDING,
    "0"
  )}`;
}

/**
 * Temporary URL-safe verification token (32 characters) for a public /verify link.
 * Generated server-side at issue time only — the browser never proposes or sees it
 * before issuance, so two admins can never claim the same token and the number stays
 * a record-keeping device rather than a client-side random guess.
 */
export function generateVerificationToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Four characters from an alphabet without the ambiguous glyphs (I, L, O, 0, 1),
 * so a number read over the phone or retyped from a printout cannot gain one.
 *
 * It exists to make the printed reference non-enumerable (docs 01 §S7): the
 * sequence alone walks the whole graduate list in a few hundred requests, while
 * `…-K7Q2` adds ~923,000 combinations per number. Numbers issued before this
 * change carry no suffix and still verify.
 */
const NUMBER_SUFFIX_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const NUMBER_SUFFIX_LENGTH = 4;

function certificateNumberSuffix(): string {
  const bytes = randomBytes(NUMBER_SUFFIX_LENGTH);
  let suffix = "";
  for (const byte of bytes) {
    suffix += NUMBER_SUFFIX_ALPHABET[byte % NUMBER_SUFFIX_ALPHABET.length];
  }
  return suffix;
}

/**
 * Next sequential certificate number in the `DT-CERT-{year}-{NNNNN}-{XXXX}`
 * series, taken from the `Counter` row for that year. The counter is incremented
 * by the database in a single upsert, so concurrent issuers cannot be handed the
 * same number; the unique index on `certificateNumber` remains the final backstop.
 *
 * Call it with the transaction that inserts the certificate so the number and the
 * row commit together. A rolled-back issue leaves a gap — accepted, because a
 * certificate number only has to be unique and chronological, not dense.
 */
export async function generateCertificateNumber(
  year: number = nepalYear(),
  tx?: Tx
): Promise<string> {
  return `${certificateNumber(year, await nextSequence(`cert:${year}`, tx))}-${certificateNumberSuffix()}`;
}

/**
 * The number issuance would mint next, without consuming it. Used by the preview
 * route so repeatedly previewing a draft cannot burn through the year's sequence.
 * The suffix shown here is a placeholder for the layout, not the one that will be
 * printed — the real one is drawn when the certificate is issued.
 */
export async function peekCertificateNumber(
  year: number = nepalYear()
): Promise<string> {
  return `${certificateNumber(year, (await peekSequence(`cert:${year}`)) + 1)}-${certificateNumberSuffix()}`;
}
