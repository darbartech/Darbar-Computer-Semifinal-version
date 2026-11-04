import { NextRequest, NextResponse } from "next/server";
import { requireStudentProfile } from "@/server/student-session";
import { getStudentCertificateDownloadMeta } from "@/server/dal/students";
import { serveCertificatePdf } from "@/server/certificates/pdf/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/student/certificates/[id]/download
 *
 * The only way a student can reach a certificate PDF. `pdfUrl` is no longer sent to
 * the browser, because the private storage key would be useless there anyway and a
 * public copy of the document would leak it to anyone who found the URL.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Redirects to the student login page when there is no active STUDENT session.
  const { profile } = await requireStudentProfile();
  const { id } = await params;

  const meta = await getStudentCertificateDownloadMeta(
    { id: profile.id, studentCode: profile.studentCode },
    id
  );
  if (!meta || !meta.certificateNumber) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }
  if (meta.status !== "ISSUED" && meta.status !== "REISSUED") {
    return NextResponse.json(
      { error: "Certificate cannot be downloaded in its current state" },
      { status: 409 }
    );
  }

  return serveCertificatePdf(id, {
    certificateNumber: meta.certificateNumber,
    pdfUrl: meta.pdfUrl,
  });
}
