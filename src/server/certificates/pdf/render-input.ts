import "server-only";
import type { CertificateRenderInput } from "./engine/types";
import type { PdfCertificateData } from "./types";
import {
  DARBARTECH_CERTIFICATE_TEMPLATE_V2,
  getTemplateById,
} from "./engine/templates/darbartech-certificate-v2";

/**
 * The v2 template hard-codes four module rows (module1Title … module4Title), so
 * the design only has a correct layout for exactly four modules. Refuse to render
 * anything else rather than silently dropping or overflowing a row.
 */
export const REQUIRED_MODULE_COUNT = 4;

export const ISSUER_NAME_FALLBACK = "DarbarTech Group of Technology";

export type ToRenderInputResult =
  | { ok: true; input: CertificateRenderInput }
  | { ok: false; error: string };

/**
 * The renderer calls `parseISO(issueDate)` and, separately,
 * `new Date(issueDate).toISOString().slice(0, 10)`. Feeding it a full UTC timestamp
 * would format the date in the server's local zone and can print the wrong day
 * (e.g. 2026-10-06T00:00:00Z is already the 6th in Kathmandu but the 5th in UTC-5).
 * The reference payload passes a bare `YYYY-MM-DD`, so match that exactly.
 */
function toDateOnly(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/**
 * Adapt a stored certificate to the reference renderer's input contract.
 *
 * This is the only place that knows about both shapes. The template, renderer and
 * all layout logic are the reference project's code, untouched.
 */
export function toCertificateRenderInput(
  data: PdfCertificateData,
  opts?: {
    trainingProvider?: string;
    /** Used when the certificate has no stored program duration. */
    programDurationFallback?: string | null;
  }
): ToRenderInputResult {
  const modules = data.items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      order: index + 1,
      title: item.title,
      subtitle: item.subtitle ?? undefined,
    }));

  if (modules.length !== REQUIRED_MODULE_COUNT) {
    return {
      ok: false,
      error: `The DarbarTech certificate design requires exactly ${REQUIRED_MODULE_COUNT} modules; this certificate has ${modules.length}.`,
    };
  }

  const [primary, secondary] = data.issuedSignatories;

  if (!primary) {
    return {
      ok: false,
      error:
        "A certificate needs at least one signatory before a PDF can be rendered.",
    };
  }

  const duration = (
    opts?.programDurationFallback ??
    data.programDurationText ??
    ""
  ).trim();

  const template = DARBARTECH_CERTIFICATE_TEMPLATE_V2;

  return {
    ok: true,
    input: {
      templateId: template.templateId,
      templateVersion: template.version,
      rendererVersion: template.rendererVersion,

      certificateNumber: data.certificateNumber,

      recipient: { name: data.recipientName },

      program: {
        title: data.courseName,
        duration,
      },

      trainingProvider: opts?.trainingProvider?.trim() || undefined,

      modules,

      grade: data.grade?.trim() || undefined,

      completionDate: toDateOnly(
        data.completionDateIso ?? null
      ) || undefined,
      issueDate: toDateOnly(data.issueDateIso),

      // The template's `position` line is the signatory's role, which Darbar stores
      // in `title` ("Executive Director"); `designation` is the org unit
      // ("Darbar Computer Institute") and has no zone on the certificate.
      signatory: {
        name: primary.name,
        position: primary.title,
      },
      secondarySignatory: secondary
        ? { name: secondary.name, position: secondary.title }
        : undefined,

      verificationUrl: data.verificationUrl,
    },
  };
}

export { getTemplateById, DARBARTECH_CERTIFICATE_TEMPLATE_V2 };
