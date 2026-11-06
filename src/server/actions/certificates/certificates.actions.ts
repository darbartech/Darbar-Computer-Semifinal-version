"use server";
import "server-only";
import { z } from "zod";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import {
  CERTIFICATE_TAGS,
  certificateWriteTags,
  invalidate,
} from "@/server/revalidate";
import {
  createCertificate,
  deleteCertificate,
  generateAndPersistPdfForCertificate,
  getCertificateWriteSnapshot,
  issueCertificate,
  regenerateCertificatePdf,
  reissueCertificate,
  returnCertificateToDraft,
  revokeCertificate,
  submitForReviewCertificate,
  updateCertificate,
  updateCertificatePdfUrl,
} from "@/server/dal/certificates";
import { retryOnUniqueViolation } from "@/server/dal/counters";
import { requireStepUp } from "@/server/services/step-up";
import {
  certificateWriteSchema,
  issueCertificateSchema,
  reissueCertificateSchema,
  revokeCertificateSchema,
  type CertificateWriteValues,
} from "@/lib/validators/certificates";
import type {
  CreateCertificateInput,
  UpdateCertificateInput,
} from "@/server/types/certificates";
import { sanitizeForLog } from "@/server/certificates/utils";

export type CertificateActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const NO_PERMISSION = "You don't have permission to do that";
const NOT_FOUND = "Certificate not found";
/** Shown when the row moved on under this admin, so their click changed nothing. */
const STALE_ISSUE =
  "This certificate was already issued or changed. Refresh the page.";
const STALE_REVOKE =
  "This certificate was already revoked or changed. Refresh the page.";
const STALE_REISSUE =
  "This certificate was already reissued or changed. Refresh the page.";

/**
 * Issues are confirmed only after the server has persisted the certificate AND
 * generated its PDF. If rendering fails the certificate stays ISSUED with a null
 * pdfUrl; the download route then regenerates the PDF on demand, so a record is
 * never "issued but undownloadable".
 */
async function generatePdfForIssuedCert(certId: string): Promise<string | null> {
  try {
    const pdfResult = await generateAndPersistPdfForCertificate(certId);
    if (pdfResult.ok) {
      const updated = await updateCertificatePdfUrl(certId, pdfResult.pdfUrl);
      return updated.pdfUrl;
    }
    console.error(
      "[certificates.issue.pdf] PDF generation failed for cert_id=",
      sanitizeForLog(certId, 16),
      "reason=",
      sanitizeForLog(pdfResult.error, 160)
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "unknown");
    console.error(
      "[certificates.issue.pdf] Unexpected error generating PDF for cert_id=",
      sanitizeForLog(certId, 16),
      "err=",
      sanitizeForLog(message, 160)
    );
  }
  return null;
}

function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message.includes("FORBIDDEN");
}

function invalid(error: z.ZodError): CertificateActionResult<never> {
  return {
    ok: false,
    error: "Please fix the highlighted fields",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function fail(message: string): CertificateActionResult<never> {
  return { ok: false, error: message };
}

function writeValuesToCreateInput(
  data: CertificateWriteValues
): CreateCertificateInput {
  return {
    recipientName: data.recipientName,
    // Student identifiers are always minted server-side (DT-STD-{year}-{NNNNN}),
    // never taken from the form.
    recipientIdNumber: null,
    courseId: data.courseId ?? null,
    courseName: data.courseName,
    completionDate: data.completionDate ?? null,
    issueDate: data.issueDate ?? null,
    grade: data.grade ?? null,
    programDuration: data.programDuration ?? null,
    templateId: data.templateId ?? null,
    items: data.items.map((item) => ({
      order: item.order,
      title: item.title,
      subtitle: item.subtitle ?? null,
      shortLabel: item.shortLabel ?? null,
    })),
    metadata: null,
  };
}

function writeValuesToUpdateInput(
  data: CertificateWriteValues
): UpdateCertificateInput {
  return {
    recipientName: data.recipientName,
    // recipientIdNumber is deliberately omitted: it is system-owned after creation
    // (auto-minted as DT-STD-{year}-{NNNNN}), so edits must never modify it.
    courseId: data.courseId ?? null,
    courseName: data.courseName,
    completionDate: data.completionDate ?? null,
    issueDate: data.issueDate ?? null,
    grade: data.grade ?? null,
    programDuration: data.programDuration ?? null,
    templateId: data.templateId ?? null,
    items: data.items.map((item) => ({
      order: item.order,
      title: item.title,
      subtitle: item.subtitle ?? null,
      shortLabel: item.shortLabel ?? null,
    })),
    // Status and pdfUrl are lifecycle-managed (issue/revoke/reissue) and must never
    // be writable from the draft editor.
    metadata: null,
  };
}

export async function createCertificateAction(
  input: unknown
): Promise<CertificateActionResult<{ id: string; status: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.write");
    actor = { id: user.id, email: user.email };

    const parsed = certificateWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    const created = await createCertificate(
      writeValuesToCreateInput(data),
      user.id
    );

    await audit({
      actor,
      action: "certificate.create",
      entity: "Certificate",
      entityId: created.id,
      summary: "Created certificate draft",
      meta: {
        status: created.status,
        courseId: data.courseId ?? null,
      },
    });

    invalidate(...certificateWriteTags({ id: created.id }));
    return { ok: true, data: { id: created.id, status: created.status } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[createCertificateAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

export async function updateCertificateAction(
  input: unknown
): Promise<CertificateActionResult<{ id: string; status: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.write");
    actor = { id: user.id, email: user.email };

    const parsed = certificateWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    if (!data.id) return fail("Certificate id is required");

    const before = await getCertificateWriteSnapshot(data.id);
    if (!before) return fail(NOT_FOUND);

    if (before.status !== "DRAFT" && before.status !== "PENDING_ISSUE") {
      return fail(
        `This certificate is ${before.status} and cannot be edited directly. Revoke and reissue instead.`
      );
    }

    const updated = await updateCertificate(
      data.id,
      writeValuesToUpdateInput(data)
    );

    await audit({
      actor,
      action: "certificate.update",
      entity: "Certificate",
      entityId: updated.id,
      summary: `Updated certificate (${before.status} -> ${updated.status})`,
      meta: {
        previousStatus: before.status,
        newStatus: updated.status,
      },
    });

    invalidate(
      ...certificateWriteTags({
        id: updated.id,
        verificationToken: before.verificationToken ?? null,
      })
    );
    return { ok: true, data: { id: updated.id, status: updated.status } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[updateCertificateAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

export async function submitForReviewCertificateAction(
  input: unknown
): Promise<CertificateActionResult<{ id: string; status: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.write");
    actor = { id: user.id, email: user.email };

    const parsed = z
      .object({ id: z.string().trim().min(1).max(64) })
      .safeParse(input);
    if (!parsed.success) return fail("Invalid request");
    const { id } = parsed.data;

    const before = await getCertificateWriteSnapshot(id);
    if (!before) return fail(NOT_FOUND);

    if (before.status !== "DRAFT") {
      return fail(
        `Certificate is ${before.status}. Only DRAFT certificates can be submitted for review.`
      );
    }

    const updated = await submitForReviewCertificate(id);

    await audit({
      actor,
      action: "certificate.submit_for_review",
      entity: "Certificate",
      entityId: updated.id,
      summary: `Submitted certificate for review (${before.status} -> ${updated.status})`,
      meta: {
        previousStatus: before.status,
        newStatus: updated.status,
      },
    });

    invalidate(...certificateWriteTags({ id: updated.id }));
    return { ok: true, data: { id: updated.id, status: updated.status } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[submitForReviewCertificateAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

export async function returnCertificateToDraftAction(
  input: unknown
): Promise<CertificateActionResult<{ id: string; status: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.write");
    actor = { id: user.id, email: user.email };

    const parsed = z
      .object({ id: z.string().trim().min(1).max(64) })
      .safeParse(input);
    if (!parsed.success) return fail("Invalid request");
    const { id } = parsed.data;

    const before = await getCertificateWriteSnapshot(id);
    if (!before) return fail(NOT_FOUND);

    if (before.status !== "PENDING_ISSUE") {
      return fail(
        `Certificate is ${before.status}. Only PENDING_ISSUE certificates can be moved back to draft.`
      );
    }

    const updated = await returnCertificateToDraft(id);

    await audit({
      actor,
      action: "certificate.return_to_draft",
      entity: "Certificate",
      entityId: updated.id,
      summary: `Moved certificate back to draft (${before.status} -> ${updated.status})`,
      meta: {
        previousStatus: before.status,
        newStatus: updated.status,
      },
    });

    invalidate(...certificateWriteTags({ id: updated.id }));
    return { ok: true, data: { id: updated.id, status: updated.status } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[returnCertificateToDraftAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

export type CertificateIssueResult = {
  id: string;
  status: string;
  certificateNumber: string;
  verificationToken: string;
  pdfUrl: string | null;
};

export async function issueCertificateAction(
  input: unknown
): Promise<CertificateActionResult<CertificateIssueResult>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.issue");
    actor = { id: user.id, email: user.email };

    const parsed = issueCertificateSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    // An issued certificate is the one thing here that cannot be taken back
    // quietly: it goes public on /verify the moment it lands (task 2).
    const stepUp = await requireStepUp(user, "certificate.issue", input);
    if (!stepUp.ok) return fail(stepUp.error);

    const before = await getCertificateWriteSnapshot(data.id);
    if (!before) return fail(NOT_FOUND);

    if (before.status !== "DRAFT" && before.status !== "PENDING_ISSUE") {
      return fail(
        `Certificate is ${before.status}. Only DRAFT or PENDING_ISSUE can be issued.`
      );
    }

    // The server is the single authority for the document identity: a legacy draft
    // that already carries a number keeps it, otherwise the issuing transaction
    // mints the next sequential number and a fresh verify token. The client never
    // proposes these values, and a second admin clicking "Issue" concurrently gets
    // the stale-state message instead of a duplicate certificate (docs 02 B3).
    const issued = await retryOnUniqueViolation(() =>
      issueCertificate({
        id: data.id,
        issueDate: data.issueDate ?? null,
        issuedSignatories: data.issuedSignatories,
      })
    );
    if (!issued) return fail(STALE_ISSUE);

    const certificateNumber = issued.certificateNumber;
    const verificationToken = issued.verificationToken;

    const pdfUrl = await generatePdfForIssuedCert(issued.id);

    await audit({
      actor,
      action: "certificate.issue",
      entity: "Certificate",
      entityId: issued.id,
      summary: `Issued certificate ${certificateNumber} (${before.status} -> ${issued.status})`,
      meta: {
        certificateNumber,
        previousStatus: before.status,
        signatoryCount: data.issuedSignatories.length,
        pdfUrl,
      },
    });

    invalidate(
      ...certificateWriteTags({
        id: issued.id,
        verificationToken,
      })
    );
    return {
      ok: true,
      data: {
        id: issued.id,
        status: issued.status,
        certificateNumber,
        verificationToken,
        pdfUrl,
      },
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[issueCertificateAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

export async function revokeCertificateAction(
  input: unknown
): Promise<CertificateActionResult<{ id: string; status: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.revoke");
    actor = { id: user.id, email: user.email };

    const parsed = revokeCertificateSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    // Revoked is the one state a printed certificate cannot come back from.
    const stepUp = await requireStepUp(user, "certificate.revoke", input);
    if (!stepUp.ok) return fail(stepUp.error);

    const before = await getCertificateWriteSnapshot(data.id);
    if (!before) return fail(NOT_FOUND);

    if (before.status !== "ISSUED" && before.status !== "REISSUED") {
      return fail(
        `Certificate is ${before.status}. Only ISSUED or REISSUED can be revoked.`
      );
    }

    const revoked = await revokeCertificate({
      id: data.id,
      revokeCategory: data.revokeCategory,
      revokeReason: data.revokeReason,
    });
    if (!revoked) return fail(STALE_REVOKE);

    await audit({
      actor,
      action: "certificate.revoke",
      entity: "Certificate",
      entityId: revoked.id,
      summary: `Revoked certificate ${before.certificateNumber ?? "?"} (${before.status} -> ${revoked.status})`,
      meta: {
        certificateNumber: before.certificateNumber ?? null,
        previousStatus: before.status,
        revokeCategory: data.revokeCategory,
      },
    });

    invalidate(
      ...certificateWriteTags({
        id: revoked.id,
        verificationToken: before.verificationToken ?? null,
      })
    );
    return { ok: true, data: { id: revoked.id, status: revoked.status } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[revokeCertificateAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

export async function reissueCertificateAction(
  input: unknown
): Promise<CertificateActionResult<CertificateIssueResult>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.reissue");
    actor = { id: user.id, email: user.email };

    const parsed = reissueCertificateSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    // A reissue is both moves at once: the original stops standing and a new
    // verifiable document takes its number.
    const stepUp = await requireStepUp(user, "certificate.reissue", input);
    if (!stepUp.ok) return fail(stepUp.error);

    const before = await getCertificateWriteSnapshot(data.id);
    if (!before) return fail(NOT_FOUND);

    if (before.status !== "ISSUED") {
      return fail(
        before.status === "REISSUED"
          ? "This certificate has already been reissued. Reissue its replacement instead."
          : `Certificate is ${before.status}. Only an issued certificate can be reissued.`
      );
    }

    // A reissue is a brand-new document, so the transaction that flips the original
    // to REISSUED mints a fresh number + token for the clone (never reusing the
    // original's identity).
    const reissued = await retryOnUniqueViolation(() =>
      reissueCertificate({
        id: data.id,
        reissueReason: data.reissueReason,
        issueDate: data.issueDate ?? null,
        issuedSignatories: data.issuedSignatories,
      })
    );
    if (!reissued) return fail(STALE_REISSUE);

    const certificateNumber = reissued.certificateNumber;
    const verificationToken = reissued.verificationToken;

    const pdfUrl = await generatePdfForIssuedCert(reissued.id);

    await audit({
      actor,
      action: "certificate.reissue",
      entity: "Certificate",
      entityId: reissued.id,
      summary: `Reissued ${before.certificateNumber ?? "?"} -> ${certificateNumber}`,
      meta: {
        parentCertificateId: data.id,
        parentCertificateNumber: before.certificateNumber ?? null,
        newCertificateNumber: certificateNumber,
        previousStatus: before.status,
        pdfUrl,
      },
    });

    invalidate(
      ...certificateWriteTags({
        id: reissued.id,
        verificationToken,
      }),
      ...certificateWriteTags({
        id: data.id,
        verificationToken: before.verificationToken ?? null,
      }),
      ...CERTIFICATE_TAGS
    );
    return {
      ok: true,
      data: {
        id: reissued.id,
        status: reissued.status,
        certificateNumber,
        verificationToken,
        pdfUrl,
      },
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[reissueCertificateAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

export async function deleteCertificateAction(
  input: unknown
): Promise<CertificateActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.delete");
    actor = { id: user.id, email: user.email };

    const parsed = z
      .object({ id: z.string().trim().min(1).max(64) })
      .safeParse(input);
    if (!parsed.success) return fail("Invalid request");
    const { id } = parsed.data;

    const before = await getCertificateWriteSnapshot(id);
    if (!before) return fail(NOT_FOUND);

    if (before.status !== "DRAFT" && before.status !== "PENDING_ISSUE") {
      return fail(
        `Certificate is ${before.status}. Only DRAFT or PENDING_ISSUE can be deleted. Revoke or reissue issued certificates.`
      );
    }

    await deleteCertificate(id);

    await audit({
      actor,
      action: "certificate.delete",
      entity: "Certificate",
      entityId: id,
      summary: `Deleted draft certificate (${before.status})`,
      meta: {
        status: before.status,
      },
    });

    invalidate(...certificateWriteTags({ id }), ...CERTIFICATE_TAGS);
    return { ok: true, data: { id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[deleteCertificateAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}

export async function regenerateCertificatePdfAction(
  input: unknown
): Promise<CertificateActionResult<{ id: string; pdfUrl: string | null }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission("certificate.regenerate_pdf");
    actor = { id: user.id, email: user.email };

    const parsed = z
      .object({ id: z.string().trim().min(1).max(64) })
      .safeParse(input);
    if (!parsed.success) return fail("Invalid request");
    const { id } = parsed.data;

    const before = await getCertificateWriteSnapshot(id);
    if (!before) return fail(NOT_FOUND);

    if (before.status !== "ISSUED" && before.status !== "REISSUED") {
      return fail(
        `Certificate is ${before.status}. Only ISSUED or REISSUED certificates have PDFs to regenerate.`
      );
    }

    // Regeneration is always server-side: re-render the current record to a fresh
    // file and repoint the pdfUrl. No client value is involved.
    const generated = await generateAndPersistPdfForCertificate(id);
    if (!generated.ok) {
      console.error(
        "[certificates.regenerate.pdf] Server-side regeneration failed for cert_id=",
        sanitizeForLog(id, 16),
        "reason=",
        sanitizeForLog(generated.error, 160)
      );
      return fail("PDF regeneration failed temporarily. Please retry in a moment.");
    }
    await regenerateCertificatePdf(id, generated.pdfUrl);

    await audit({
      actor,
      action: "certificate.regenerate_pdf",
      entity: "Certificate",
      entityId: id,
      summary: `Regenerated PDF for ${before.certificateNumber ?? "?"}`,
      meta: {
        certificateNumber: before.certificateNumber ?? null,
        status: before.status,
      },
    });

    invalidate(
      ...certificateWriteTags({
        id,
        verificationToken: before.verificationToken ?? null,
      })
    );
    return { ok: true, data: { id, pdfUrl: generated.pdfUrl } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return fail(NO_PERMISSION);
    console.error(
      "[regenerateCertificatePdfAction]",
      error instanceof Error ? error.message : "unknown"
    );
    return fail(GENERIC_FAILURE);
  }
}
