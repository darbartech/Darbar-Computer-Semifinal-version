import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";

export const CERTIFICATE_NUMBER_PREFIX = "DT-CERT";
export const STUDENT_ID_PREFIX = "DT-STD";
const SEQUENCE_PADDING = 5;

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
 * Next sequential certificate number in the `DT-CERT-{year}-{NNNNN}` series. The
 * sequence is derived from the highest number already stored for the year, so the
 * server remains the single authority and concurrent issuers cannot hand out a
 * colliding number. The unique index on `certificateNumber` is the final backstop.
 */
export async function generateCertificateNumber(
  year: number = new Date().getFullYear()
): Promise<string> {
  const prefix = `${CERTIFICATE_NUMBER_PREFIX}-${year}-`;
  const rows = await db.certificate.findMany({
    where: { certificateNumber: { startsWith: prefix } },
    select: { certificateNumber: true },
  });

  let maxSequence = 0;
  for (const row of rows) {
    const suffix = row.certificateNumber?.slice(prefix.length) ?? "";
    if (/^\d+$/.test(suffix)) {
      const value = Number(suffix);
      if (Number.isSafeInteger(value) && value > maxSequence) maxSequence = value;
    }
  }

  const next = maxSequence + 1;
  if (!Number.isSafeInteger(next) || String(next).length > SEQUENCE_PADDING + 1) {
    throw new Error("Certificate number sequence exhausted for this year");
  }
  return `${prefix}${String(next).padStart(SEQUENCE_PADDING, "0")}`;
}

/**
 * Next sequential student/registration ID in the `DT-STD-{year}-{NNNNN}` series,
 * derived from the highest recipient ID already stored for the year. Mirrors the
 * certificate-number sequence so both identifiers stay server-authoritative. Used
 * to auto-populate `recipientIdNumber` when a draft is created without one.
 */
export async function generateStudentId(
  year: number = new Date().getFullYear()
): Promise<string> {
  const prefix = `${STUDENT_ID_PREFIX}-${year}-`;
  const rows = await db.certificate.findMany({
    where: { recipientIdNumber: { startsWith: prefix } },
    select: { recipientIdNumber: true },
  });

  let maxSequence = 0;
  for (const row of rows) {
    const suffix = row.recipientIdNumber?.slice(prefix.length) ?? "";
    if (/^\d+$/.test(suffix)) {
      const value = Number(suffix);
      if (Number.isSafeInteger(value) && value > maxSequence) maxSequence = value;
    }
  }

  const next = maxSequence + 1;
  if (!Number.isSafeInteger(next) || String(next).length > SEQUENCE_PADDING + 1) {
    throw new Error("Student ID sequence exhausted for this year");
  }
  return `${prefix}${String(next).padStart(SEQUENCE_PADDING, "0")}`;
}