import { NextRequest, NextResponse } from "next/server";
import { isRedirectError, requirePermission } from "@/server/session";
import { getCertificateDownloadMeta } from "@/server/dal/certificates";
import { serveCertificatePdf } from "@/server/certificates/pdf/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/techdarbar/certificates/[id]/download
 *
 * The staff-side way to download an issued certificate. The PDFs are stored outside
 * `public/`, so this route is the only way to reach one — a guessed URL cannot fetch
 * a graduate's document.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("certificate.read");

    const { id } = await params;
    const meta = await getCertificateDownloadMeta(id);
    if (!meta || !meta.certificateNumber) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }
    if (meta.status !== "ISSUED" && meta.status !== "REISSUED") {
      return NextResponse.json(
        { error: "Certificate cannot be downloaded in its current state" },
        { status: 409 }
      );
    }

    return await serveCertificatePdf(id, {
      certificateNumber: meta.certificateNumber,
      pdfUrl: meta.pdfUrl,
    });
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes("FORBIDDEN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error(
      "[certificates.download]",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
