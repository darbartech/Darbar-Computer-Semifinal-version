import { NextRequest, NextResponse } from "next/server";
import { requireStudentProfile } from "@/server/student-session";
import { allow } from "@/server/services/rate-limit";
import { getReceiptDocument } from "@/server/dal/fees";
import { receiptPdfResponse, RECEIPT_DOWNLOAD_LIMIT } from "@/server/fees/receipt-serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/student/payments/[id]/receipt (docs 05 §4)
 *
 * The receipt is the student's own document, but the URL contains only a `Payment.id`,
 * which is not unguessable enough to be a capability. The invoice behind it is
 * compared to the signed-in profile, and a mismatch answers 404 — the same thing a
 * non-existent id returns, so probing cannot list other students' receipts.
 *
 * The counter is what makes the probe uninteresting: 404s cost the account that
 * asks for them, so walking the id space has a price (see `RECEIPT_DOWNLOAD_LIMIT`).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile } = await requireStudentProfile();

  if (!(await allow(`receipt:${profile.id}`, RECEIPT_DOWNLOAD_LIMIT))) {
    return NextResponse.json(
      { error: "Too many downloads. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const { id } = await params;

  const document = await getReceiptDocument(id);
  if (!document || document.invoice.studentId !== profile.id) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  return receiptPdfResponse(document);
}
