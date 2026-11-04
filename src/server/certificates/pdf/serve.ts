import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";
import { CERTIFICATE_PDF_DIR, CERTIFICATE_PDF_KEY_PREFIX } from "@/server/constants";
import {
  generateAndPersistPdfForCertificate,
  updateCertificatePdfUrl,
} from "@/server/dal/certificates";

/**
 * Shared PDF delivery for the two sanctioned download routes (staff and the owning
 * student). Authorization stays in the callers; this module only ever receives an id
 * whose access has already been decided.
 */

export type CertificatePdfMeta = {
  certificateNumber: string;
  pdfUrl: string | null;
};

/**
 * Only these hosts may be proxied. `pdfUrl` is a DB column, so an unrestricted
 * `fetch()` of it would let anyone who can write the column turn the download route
 * into an internal-network probe.
 */
const REMOTE_PDF_HOSTS: string[] = ["res.cloudinary.com"];

/**
 * Resolves a stored `/certificates/...` key to an absolute path, but ONLY while it
 * stays inside the private PDF directory. The comparison is against the root plus a
 * separator, so a sibling like `storage/uploads-evil` cannot satisfy the prefix test.
 */
export function certificatePdfPath(pdfUrl: string | null): string | null {
  if (!pdfUrl || !pdfUrl.startsWith(`${CERTIFICATE_PDF_KEY_PREFIX}/`)) return null;

  const root = path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    CERTIFICATE_PDF_DIR
  );
  const relative = pdfUrl.slice(CERTIFICATE_PDF_KEY_PREFIX.length + 1);
  const resolved = path.resolve(/*turbopackIgnore: true*/ root, relative);

  return resolved.startsWith(root + path.sep) ? resolved : null;
}

export async function serveCertificatePdf(
  id: string,
  meta: CertificatePdfMeta
): Promise<NextResponse> {
  let pdfUrl = meta.pdfUrl;
  let localPath = certificatePdfPath(pdfUrl);

  if (!localPath) {
    // No usable file yet — render on demand so an issued certificate is always
    // downloadable.
    const generated = await generateAndPersistPdfForCertificate(id);
    if (!generated.ok) {
      console.error(
        "[certificates.serve] On-demand PDF generation failed for cert_id=",
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
    localPath = certificatePdfPath(pdfUrl);
  }

  if (!localPath) {
    return remotePdfResponse(pdfUrl, meta.certificateNumber);
  }

  try {
    const fileStat = await stat(localPath);
    const webStream = Readable.toWeb(createReadStream(localPath)) as unknown as ReadableStream;
    return new NextResponse(webStream, {
      status: 200,
      headers: pdfHeaders(meta.certificateNumber, fileStat.size),
    });
  } catch (error) {
    console.error(
      "[certificates.serve] Stored PDF unreadable for cert_id=",
      id,
      "err=",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "The PDF could not be read from storage." },
      { status: 502 }
    );
  }
}

async function remotePdfResponse(
  pdfUrl: string | null,
  certificateNumber: string
): Promise<NextResponse> {
  let remote: URL;
  try {
    remote = new URL(pdfUrl ?? "");
  } catch {
    return NextResponse.json(
      { error: "Stored PDF location is not usable" },
      { status: 502 }
    );
  }

  if (remote.protocol !== "https:" || !REMOTE_PDF_HOSTS.includes(remote.hostname)) {
    return NextResponse.json(
      { error: "Stored PDF location is not usable" },
      { status: 502 }
    );
  }

  const response = await fetch(remote.toString(), { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { error: "The PDF could not be fetched from storage" },
      { status: 502 }
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: pdfHeaders(certificateNumber, bytes.byteLength),
  });
}

function pdfHeaders(certificateNumber: string, size: number): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Length", String(size));
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("X-Content-Type-Options", "nosniff");
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
