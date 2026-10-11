import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { isRedirectError, requirePermission } from "@/server/session";
import {
  generateAndPersistPdfForCertificate,
  getCertificateDownloadMeta,
  updateCertificatePdfUrl,
} from "@/server/dal/certificates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/certificates/[id]/download
 *
 * The single sanctioned way to download an issued certificate. It can never 404 on
 * a freshly issued record: if the stored file is missing (background generation
 * failed or the record predates issuance changes) it renders the PDF on demand and
 * repoints pdfUrl, then streams it with an attachment filename derived from the
 * certificate number.
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

    let pdfUrl = meta.pdfUrl;
    let localPath = localPdfPath(pdfUrl);

    if (!localPath) {
      // No usable file yet — render on demand so an issued certificate is always
      // downloadable.
      const generated = await generateAndPersistPdfForCertificate(id);
      if (!generated.ok) {
        console.error(
          "[certificates.download] On-demand PDF generation failed for cert_id=",
          id,
          "reason=",
          generated.error
        );
        return NextResponse.json(
          { error: "The PDF is not ready yet. Please retry in a moment." },
          { status: 503 }
        );
      }
      await updateCertificatePdfUrl(id, generated.pdfUrl);
      pdfUrl = generated.pdfUrl;
      localPath = localPdfPath(pdfUrl);
    }

    if (!localPath) {
      // pdfUrl points at a remote file (e.g. Cloudinary). Proxy it as an attachment.
      if (!pdfUrl || !/^https?:\/\//i.test(pdfUrl)) {
        return NextResponse.json(
          { error: "Stored PDF location is not usable" },
          { status: 502 }
        );
      }
      const remote = await fetch(pdfUrl, { cache: "no-store" });
      if (!remote.ok) {
        return NextResponse.json(
          { error: "The PDF could not be fetched from storage" },
          { status: 502 }
        );
      }
      const bytes = new Uint8Array(await remote.arrayBuffer());
      return new NextResponse(bytes, {
        status: 200,
        headers: pdfHeaders(meta.certificateNumber, bytes.byteLength),
      });
    }

    const fileStat = await stat(localPath);
    const webStream = Readable.toWeb(
      createReadStream(localPath)
    ) as unknown as ReadableStream;
    return new NextResponse(webStream, {
      status: 200,
      headers: pdfHeaders(meta.certificateNumber, fileStat.size),
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

/**
 * Resolves a stored `/uploads/certificates/...` URL to an absolute path, but ONLY if
 * it stays inside `public/uploads`. Anything else returns null so the caller treats
 * the value as remote or unusable rather than reading an arbitrary file.
 */
function localPdfPath(pdfUrl: string | null): string | null {
  if (!pdfUrl || !pdfUrl.startsWith("/uploads/")) return null;
  const uploadsRoot = path.resolve(
    path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads")
  );
  // Statically scoped under public/uploads; the DB-owned remainder is validated to
  // stay inside that root by resolving the full path and checking the prefix.
  const relative = pdfUrl.replace(/^\/uploads\//, "");
  const resolved = path.resolve(
    path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads", relative)
  );
  return resolved.startsWith(uploadsRoot) && resolved !== uploadsRoot
    ? resolved
    : null;
}

function pdfHeaders(certificateNumber: string, size: number): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Length", String(size));
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${safeFileName(certificateNumber)}"`
  );
  return headers;
}

function safeFileName(certificateNumber: string): string {
  const clean = certificateNumber.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 64);
  return `Certificate-${clean || "document"}.pdf`;
}