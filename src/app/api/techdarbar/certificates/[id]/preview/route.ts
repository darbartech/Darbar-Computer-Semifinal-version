import { NextRequest, NextResponse } from "next/server";
import { isRedirectError, requirePermission } from "@/server/session";
import {
  adminBuildPreviewPdfData,
  getCertificateDownloadMeta,
} from "@/server/dal/certificates";
import { generateCertificatePdfBuffer } from "@/server/certificates/pdf/generator";
import { generateCertificateNumber } from "@/server/certificates/issuance";
import { resolveOfficialDomain } from "@/server/certificates/utils";
import { certificatePreviewSchema } from "@/lib/validators/certificates";
import { durationFromWeeks } from "@/lib/duration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/techdarbar/certificates/[id]/preview
 *
 * Renders the certificate exactly as it would be issued, WITHOUT persisting
 * anything: it uses the live draft data plus the signatories/issue date the admin
 * has chosen in the Issue/Reissue dialog, and a placeholder number + token that
 * are never written to the DB. This is the "Preview before approve" step — the
 * document is streamed inline so the reviewer can inspect it in a new tab before
 * confirming the issue (which is the step that actually mints the number/token).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("certificate.read");

    const { id } = await params;
    const meta = await getCertificateDownloadMeta(id);
    if (!meta) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }
    const isDraftable =
      meta.status === "DRAFT" || meta.status === "PENDING_ISSUE";
    const isReissueable = meta.status === "ISSUED" || meta.status === "REISSUED";
    if (!isDraftable && !isReissueable) {
      return NextResponse.json(
        { error: "This certificate cannot be previewed in its current state" },
        { status: 409 }
      );
    }

    const body = (await _request.json().catch(() => null)) as unknown;
    const parsed = certificatePreviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "At least one signatory is required to render a preview" },
        { status: 422 }
      );
    }

    // The preview number matches what issuance would mint next. Drafts that already
    // carry a legacy number keep it; any other state shows a fresh one (a reissue
    // always gets a brand-new identity anyway). Never persisted here.
    const certificateNumber =
      isDraftable && meta.certificateNumber
        ? meta.certificateNumber
        : await generateCertificateNumber();
    const previewToken = `preview-${id.slice(0, 10)}`;

    const pdfData = await adminBuildPreviewPdfData(id, {
      certificateNumber,
      verificationToken: previewToken,
      baseUrl: resolveOfficialDomain(),
      issueDateIso: parsed.data.issueDate
        ? parsed.data.issueDate.slice(0, 10)
        : null,
      issuedSignatories: parsed.data.issuedSignatories,
    });
    if (!pdfData) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }

    const generated = await generateCertificatePdfBuffer(pdfData, {
      programDurationFallback: durationFromWeeks(pdfData.courseDurationWeeks),
    });
    if (!generated.ok) {
      console.error(
        "[certificates.preview] Render failed for cert_id=",
        id,
        "reason=",
        generated.error
      );
      return NextResponse.json(
        { error: "The preview could not be generated. Please try again." },
        { status: 502 }
      );
    }

    return new NextResponse(new Uint8Array(generated.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(generated.byteLength),
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Disposition": `inline; filename="preview-${safeFileName(certificateNumber)}"`,
      },
    });
  } catch (error) {
    if (isRedirectError(error)) {
      // Let Next turn the redirect digest into a real 307 to the login page.
      throw error;
    }
    if (error instanceof Error && error.message.includes("FORBIDDEN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error(
      "[certificates.preview]",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

function safeFileName(certificateNumber: string): string {
  return certificateNumber.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 64) || "certificate";
}