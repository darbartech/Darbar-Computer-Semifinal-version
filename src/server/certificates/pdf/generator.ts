import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { renderCertificatePdf } from "./engine/certificateRenderer";
import { getTemplateById } from "./engine/templates/darbartech-certificate-v2";
import {
  toCertificateRenderInput,
  DARBARTECH_CERTIFICATE_TEMPLATE_V2,
} from "./render-input";
import type {
  PdfCertificateData,
  PdfGenerationResult,
  PdfPersistResult,
} from "./types";
import { sanitizeForLog, safeFileNamePart } from "../utils";
import { CERTIFICATE_PDF_DIR, CERTIFICATE_PDF_KEY_PREFIX } from "@/server/constants";

export type GeneratePdfOptions = {
  /** Printed in the duration sentence, e.g. "DarbarTech Group of Technology". */
  trainingProvider?: string;
  /** Used when the certificate has no stored program duration. */
  programDurationFallback?: string | null;
};

/**
 * Render the certificate with the DarbarTech pdf-lib engine.
 *
 * The engine, both templates and every layout/fitting helper are a verbatim port of
 * the reference Certificate-Generation project, so the output is that design rather
 * than a reinterpretation of it. The only Darbar-specific piece is the input adapter
 * (`toCertificateRenderInput`).
 */
export async function generateCertificatePdfBuffer(
  data: PdfCertificateData,
  opts?: GeneratePdfOptions
): Promise<PdfGenerationResult> {
  try {
    const mapped = toCertificateRenderInput(data, opts);
    if (!mapped.ok) {
      return { ok: false, error: mapped.error };
    }

    const template = getTemplateById(
      DARBARTECH_CERTIFICATE_TEMPLATE_V2.templateId,
      DARBARTECH_CERTIFICATE_TEMPLATE_V2.version
    );

    const result = await renderCertificatePdf(mapped.input, template);

    if (!result.success || !result.data) {
      for (const e of result.errors ?? []) {
        console.error(
          "[certificates.pdf] renderer error for cert id=",
          sanitizeForLog(data.id, 16),
          "err=",
          sanitizeForLog(e, 200)
        );
      }
      return {
        ok: false,
        error: (result.errors ?? []).join("; ") || "PDF render failed",
      };
    }

    for (const w of result.warnings ?? []) {
      console.warn(
        "[certificates.pdf] renderer warning for cert id=",
        sanitizeForLog(data.id, 16),
        "warn=",
        sanitizeForLog(w, 200)
      );
    }

    const buffer = Buffer.from(result.data);
    return { ok: true, buffer, byteLength: buffer.byteLength };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    console.error(
      "[certificates.pdf] PDF generation failed for cert id=",
      sanitizeForLog(data.id, 16),
      "number=",
      sanitizeForLog(data.certificateNumber, 24),
      "err=",
      sanitizeForLog(message, 160)
    );
    return { ok: false, error: message };
  }
}

function isLocalWritable(): boolean {
  const explicit = process.env.MEDIA_STORAGE_PROVIDER?.trim().toLowerCase();
  if (explicit === "cloudinary") return false;
  if (explicit === "local") return true;
  return process.env.NODE_ENV !== "production";
}

export async function persistCertificatePdf(
  data: PdfCertificateData,
  buffer: Buffer
): Promise<PdfPersistResult> {
  if (isLocalWritable()) {
    try {
      const dirAbs = path.resolve(/*turbopackIgnore: true*/ CERTIFICATE_PDF_DIR);
      await mkdir(dirAbs, { recursive: true });

      const stamp = new Date();
      const yyyy = stamp.getUTCFullYear();
      const mm = String(stamp.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(stamp.getUTCDate()).padStart(2, "0");
      const sub = `${yyyy}-${mm}-${dd}`;

      const subDir = path.join(dirAbs, sub);
      await mkdir(subDir, { recursive: true });

      const recipient = safeFileNamePart(data.recipientName, "recipient");
      const number = safeFileNamePart(data.certificateNumber, "cert");
      const unique = randomUUID().slice(0, 8);
      const fileName = `${number}-${recipient}-${unique}.pdf`;

      const absPath = path.join(subDir, fileName);
      await writeFile(absPath, buffer);

      const relUrl = `${CERTIFICATE_PDF_KEY_PREFIX}/${sub}/${fileName}`;

      // Stored as a key relative to the private PDF directory rather than as a URL.
      // A root-relative `/uploads/...` value would be served straight off the web
      // root, so any issued certificate would be downloadable without a session.
      return { ok: true, pdfUrl: relUrl };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      console.error(
        "[certificates.pdf] Local PDF persist failed:",
        sanitizeForLog(message, 160)
      );
      return { ok: false, error: message };
    }
  }

  return {
    ok: false,
    error:
      "Remote storage (Cloudinary) for certificates is not yet implemented. Set MEDIA_STORAGE_PROVIDER=local for local disk.",
  };
}

export async function generateAndPersistCertificatePdf(
  data: PdfCertificateData,
  opts?: GeneratePdfOptions
): Promise<PdfPersistResult> {
  const generated = await generateCertificatePdfBuffer(data, opts);
  if (!generated.ok) {
    return { ok: false, error: generated.error };
  }
  return persistCertificatePdf(data, generated.buffer);
}
