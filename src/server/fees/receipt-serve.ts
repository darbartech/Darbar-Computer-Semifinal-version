import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSiteSettings } from "@/server/dal/settings";
import { getBalanceAfterReceipt, type ReceiptDocument } from "@/server/dal/fees";
import { paymentMethodLabel } from "@/lib/validators/fees";
import { renderReceiptPdf } from "@/server/fees/receipt-pdf";

/**
 * Turning a ledger row into the PDF a counter prints (docs 05 §4). Authorization is
 * the caller's job — both routes decide access before they get here — because a
 * receipt carries a student's name, code and money.
 *
/**
 * Nothing is stored: the file is rendered per request, so voiding a payment
 * immediately changes what the same URL produces.
 */

/**
 * Downloads per account before the route says "try again later".
 *
 * Caching is the wrong fix here: the PDF is derived from live ledger state and a
 * stale receipt is a document someone could hand to a student. So the file stays
 * per-request and the *rate* is bounded instead — one render costs a DB read plus
 * PDF work, which is enough to make scraping every `Payment.id` expensive.
 *
 * Keyed by account, not address: the front desk prints a whole day's receipts
 * from one IP, and 40 in five minutes covers that without letting one session
 * walk the table.
 */
export const RECEIPT_DOWNLOAD_LIMIT = { max: 40, windowMinutes: 5 };

/** Only these hosts may be fetched for the letterhead logo. */
const LOGO_HOSTS = ["res.cloudinary.com"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * The logo comes from `Media.url`, which is either a same-site path or a
 * Cloudinary URL. Anything else is ignored rather than fetched: a DB column must
 * not be able to point the server at an internal address.
 */
async function logoBytes(url: string | null): Promise<Buffer | null> {
  if (!url) return null;

  if (url.startsWith("/")) {
    const root = path.resolve(process.cwd(), "public");
    const relative = url.slice(1).split(/[?#]/)[0];
    if (!relative) return null;
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) return null;
    try {
      const bytes = await fs.readFile(/*turbopackIgnore: true*/ file);
      return bytes.byteLength > MAX_LOGO_BYTES ? null : bytes;
    } catch {
      return null;
    }
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !LOGO_HOSTS.includes(parsed.hostname)) return null;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.byteLength > MAX_LOGO_BYTES ? null : buffer;
  } catch {
    return null;
  }
}

export async function receiptPdfResponse(
  document: ReceiptDocument
): Promise<NextResponse> {
  const [settings, balanceAfter] = await Promise.all([
    getSiteSettings(),
    getBalanceAfterReceipt(document),
  ]);

  const bytes = await renderReceiptPdf({
    receiptNo: document.receiptNo,
    receivedAt: document.receivedAt,
    instituteName: settings.general.name,
    instituteAddress: settings.contact.address,
    invoiceNumber: document.invoice.number,
    invoiceTitle: document.invoice.title,
    courseTitle: document.invoice.enrollment?.course.title ?? null,
    batchName: document.invoice.enrollment?.batch?.name ?? null,
    studentName: document.invoice.student.user.name,
    studentCode: document.invoice.student.studentCode,
    amount: document.amount,
    methodLabel: paymentMethodLabel(document.method),
    reference: document.reference,
    balanceAfter,
    receivedByName: document.receivedBy?.name ?? null,
    bankDetails: settings.fees.bankDetails,
    footer: settings.fees.receiptFooter,
    logoBytes: await logoBytes(settings.general.logoUrl),
    voided: document.status === "VOIDED",
    voidedOn: document.voidedAt,
    voidedByName: document.voidedBy?.name ?? null,
    voidReason: document.voidReason,
  });

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${safeFileName(document.receiptNo)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeFileName(receiptNo: string): string {
  const clean = receiptNo.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 64);
  return `Receipt-${clean || "document"}.pdf`;
}
