import { NextRequest, NextResponse } from "next/server";
import { isRedirectError, requirePermission } from "@/server/session";
import { allow } from "@/server/services/rate-limit";
import { getReceiptDocument } from "@/server/dal/fees";
import { receiptPdfResponse, RECEIPT_DOWNLOAD_LIMIT } from "@/server/fees/receipt-serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/techdarbar/payments/[id]/receipt (docs 05 §4)
 *
 * Rendered on demand and never stored, so a voided receipt prints as VOIDED the
 * moment the ledger says so. Guarded by `fee.read`, which excludes instructors and
 * counselors — they have no business reading anyone's money.
 *
 * Each render is metered per staff account (see `RECEIPT_DOWNLOAD_LIMIT`), so the
 * URL cannot be walked looking for other people's receipts.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("fee.read");

    if (!(await allow(`receipt:${user.id}`, RECEIPT_DOWNLOAD_LIMIT))) {
      return NextResponse.json(
        { error: "Too many downloads. Try again in a few minutes." },
        { status: 429 }
      );
    }

    const { id } = await params;
    const document = await getReceiptDocument(id);
    if (!document) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    return await receiptPdfResponse(document);
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes("FORBIDDEN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error(
      "[payments.receipt]",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
