import "server-only";
import { db } from "@/server/db";
import type { Prisma, CertificateStatus } from "@/generated/prisma/client";
import { durationFromWeeks } from "@/lib/duration";
import {
  CERTIFICATE_PAGE_SIZE,
  REQUIRED_MODULE_COUNT,
  type CertificateFilters,
} from "@/lib/validators/certificates";
import type {
  CreateCertificateInput,
  UpdateCertificateInput,
  IssueCertificateInput,
  RevokeCertificateInput,
  ReissueCertificateInput,
  AdminCertificateListResult,
  AdminCertificateDetail,
  PublicVerifyView,
  CertificateIssuedSignatoryInput,
} from "@/server/types/certificates";
import {
  mapToAdminList,
  mapToAdminDetail,
  mapToPublicVerify,
} from "@/server/dto/certificates";
import { cached } from "@/server/cache";
import { PUBLIC_VERIFY_TAGS } from "@/server/revalidate";
import type {
  PdfCertificateData,
  PdfPersistResult,
} from "@/server/certificates/pdf/types";
import { generateAndPersistCertificatePdf } from "@/server/certificates/pdf/generator";
import { generateStudentId } from "@/server/certificates/issuance";
import { getSiteSettings } from "@/server/dal/settings";
import { resolveOfficialDomain } from "@/server/certificates/utils";

const defaultInclude = {
  items: true,
  issuedSignatories: true,
} satisfies Prisma.CertificateInclude;

const adminListSelect = {
  id: true,
  certificateNumber: true,
  recipientName: true,
  courseName: true,
  status: true,
  issueDate: true,
  issuedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CertificateSelect;

function certWhere(filters: CertificateFilters): Prisma.CertificateWhereInput {
  const conditions: Prisma.CertificateWhereInput[] = [];

  if (filters.status) conditions.push({ status: filters.status });
  if (filters.courseId) conditions.push({ courseId: filters.courseId });
  if (filters.q) {
    conditions.push({
      OR: [
        { recipientName: { contains: filters.q, mode: "insensitive" } },
        { certificateNumber: { contains: filters.q, mode: "insensitive" } },
        { courseName: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }

  return { AND: conditions };
}

function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function adminListCertificates(
  filters: CertificateFilters
): Promise<AdminCertificateListResult> {
  const where = certWhere(filters);
  const total = await db.certificate.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / CERTIFICATE_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pageCount);

  const rows = await db.certificate.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    skip: (page - 1) * CERTIFICATE_PAGE_SIZE,
    take: CERTIFICATE_PAGE_SIZE,
    select: adminListSelect,
  });

  return {
    rows: rows.map(mapToAdminList),
    total,
    page,
    pageCount,
  };
}

export async function adminGetCertificate(
  id: string
): Promise<AdminCertificateDetail | null> {
  const row = await db.certificate.findUnique({
    where: { id },
    include: defaultInclude,
  });
  if (!row) return null;
  return mapToAdminDetail(row);
}

export const getPublicCertificateByToken = cached(
  PUBLIC_VERIFY_TAGS,
  async (token: string): Promise<PublicVerifyView | null> => {
    const row = await db.certificate.findFirst({
      where: {
        verificationToken: token,
        status: { in: ["ISSUED", "REVOKED", "REISSUED", "EXPIRED"] as Array<CertificateStatus> },
      },
      include: defaultInclude,
    });
    if (!row) return null;

    // Same helper the PDF renderer uses for the QR payload, so the code printed
    // on the certificate and the URL on this page can never disagree. It also
    // strips a trailing slash from NEXT_PUBLIC_SITE_URL; the previous inline
    // fallback produced `https://host//verify/<token>` in that case.
    const baseUrl = resolveOfficialDomain();

    return mapToPublicVerify(row, baseUrl);
  }
);

/**
 * Public lookup by the printed certificate number (e.g. `DT-CERT-2026-00125`).
 * Shares the verify cache tags so a certificate write invalidates both lookups;
 * the tag set is extended purely so the cached key never collides with the
 * per-token lookup for an identical argument string.
 */
export const getPublicCertificateByNumber = cached(
  [...PUBLIC_VERIFY_TAGS, "verify:by-number"],
  async (certificateNumber: string): Promise<PublicVerifyView | null> => {
    const row = await db.certificate.findFirst({
      where: {
        certificateNumber,
        status: { in: ["ISSUED", "REVOKED", "REISSUED", "EXPIRED"] as Array<CertificateStatus> },
      },
      include: defaultInclude,
    });
    if (!row) return null;

    const baseUrl = resolveOfficialDomain();

    return mapToPublicVerify(row, baseUrl);
  }
);

/**
 * Everything the public `/verify` search box must accept in one lookup, so the
 * page stays a thin form instead of orchestrating four cached queries:
 *  - a full verification-token URL (or bare token), extracted by the caller
 *  - the verification token itself (case-sensitive, never normalised)
 *  - the printed certificate number / student ID exactly as typed
 * Only exact values match. Certificate numbers and student IDs are sequential, so a
 * suffix/prefix match would let `?code=1` walk the whole graduate list; the page that
 * calls this throttles per visitor as well.
 * Shares the verify tags so one certificate write invalidates every variation.
 */
export const getPublicCertificateByQuery = cached(
  [...PUBLIC_VERIFY_TAGS, "verify:by-query"],
  async (query: string): Promise<PublicVerifyView | null> => {
    const compact = query.replace(/\s+/g, "").trim();
    const upper = compact.toUpperCase();
    const statuses = ["ISSUED", "REVOKED", "REISSUED", "EXPIRED"] as Array<CertificateStatus>;

    const or: Prisma.CertificateWhereInput[] = [
      { verificationToken: compact },
      { certificateNumber: upper },
      // Student IDs entered by hand may differ in case from the stored value.
      { recipientIdNumber: { equals: compact, mode: "insensitive" } },
    ];

    const row = await db.certificate.findFirst({
      where: {
        status: { in: statuses },
        OR: or,
      },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      include: defaultInclude,
    });
    if (!row) return null;

    const baseUrl = resolveOfficialDomain();
    return mapToPublicVerify(row, baseUrl);
  }
);

export async function getCertificateByToken(
  token: string
): Promise<AdminCertificateDetail | null> {
  const row = await db.certificate.findFirst({
    where: { verificationToken: token },
    include: defaultInclude,
  });
  if (!row) return null;
  return mapToAdminDetail(row);
}

export async function certificateNumberExists(
  certificateNumber: string,
  exceptId?: string
): Promise<boolean> {
  const existing = await db.certificate.findUnique({
    where: { certificateNumber },
    select: { id: true },
  });
  return !!existing && existing.id !== exceptId;
}

export async function verificationTokenExists(
  verificationToken: string,
  exceptId?: string
): Promise<boolean> {
  const existing = await db.certificate.findUnique({
    where: { verificationToken },
    select: { id: true },
  });
  return !!existing && existing.id !== exceptId;
}

export async function getCertificateWriteSnapshot(id: string) {
  return db.certificate.findUnique({
    where: { id },
    select: {
      id: true,
      certificateNumber: true,
      verificationToken: true,
      status: true,
      recipientName: true,
      courseName: true,
    },
  });
}

export async function getCertificateDownloadMeta(id: string): Promise<{
  id: string;
  certificateNumber: string | null;
  status: CertificateStatus;
  pdfUrl: string | null;
} | null> {
  return db.certificate.findUnique({
    where: { id },
    select: {
      id: true,
      certificateNumber: true,
      status: true,
      pdfUrl: true,
    },
  });
}

export async function deleteCertificate(id: string): Promise<{ id: string }> {
  return db.certificate.delete({
    where: { id },
    select: { id: true },
  });
}

export async function createCertificate(
  values: CreateCertificateInput,
  createdById?: string
): Promise<{ id: string; status: CertificateStatus }> {
  const items = (values.items ?? []).map((item) => ({
    order: item.order,
    title: item.title,
    subtitle: item.subtitle ?? null,
    shortLabel: item.shortLabel ?? null,
  }));

  // Auto-assigned when the admin leaves the student ID blank, so a certificate
  // record always carries a stable `DT-STD-{year}-{NNNNN}` identifier.
  const recipientIdNumber =
    values.recipientIdNumber?.trim() || (await generateStudentId()) || null;

  const data: Prisma.CertificateCreateInput = {
    recipientName: values.recipientName,
    recipientIdNumber,
    courseName: values.courseName,
    completionDate: parseOptionalDate(values.completionDate),
    issueDate: parseOptionalDate(values.issueDate),
    grade: values.grade ?? null,
    programDuration: values.programDuration ?? null,
    metadata: (values.metadata ?? null) as Prisma.InputJsonValue,
    status: "DRAFT",
    // Relations must use the checked form once any nested write is present. Passing
    // the scalar FK (`courseId`) alongside `items: { create }` is rejected at runtime
    // with `Unknown argument 'courseId'`.
    course: values.courseId ? { connect: { id: values.courseId } } : undefined,
    template: values.templateId ? { connect: { id: values.templateId } } : undefined,
    createdBy: createdById ? { connect: { id: createdById } } : undefined,
  };

  if (items.length > 0) {
    data.items = { create: items };
  }

  return db.certificate.create({
    data,
    select: { id: true, status: true },
  });
}

export async function updateCertificate(
  id: string,
  values: UpdateCertificateInput
): Promise<{ id: string; status: CertificateStatus }> {
  const data: Prisma.CertificateUpdateInput = {};

  if (values.recipientName !== undefined) data.recipientName = values.recipientName;
  if (values.recipientIdNumber !== undefined)
    data.recipientIdNumber = values.recipientIdNumber;
  if (values.courseName !== undefined) data.courseName = values.courseName;
  if (values.completionDate !== undefined)
    data.completionDate = parseOptionalDate(values.completionDate);
  if (values.issueDate !== undefined) data.issueDate = parseOptionalDate(values.issueDate);
  if (values.grade !== undefined) data.grade = values.grade || null;
  if (values.programDuration !== undefined)
    data.programDuration = values.programDuration || null;
  if (values.status !== undefined) data.status = values.status;
  if (values.metadata !== undefined)
    data.metadata = values.metadata as Prisma.InputJsonValue;
  if (values.pdfUrl !== undefined) data.pdfUrl = values.pdfUrl;

  // Checked relation form, required whenever `items` is written in the same call.
  if (values.courseId !== undefined) {
    data.course = values.courseId ? { connect: { id: values.courseId } } : { disconnect: true };
  }
  if (values.templateId !== undefined) {
    data.template = values.templateId
      ? { connect: { id: values.templateId } }
      : { disconnect: true };
  }

  if (values.items !== undefined) {
    data.items = {
      deleteMany: {},
      create: values.items.map((item) => ({
        order: item.order,
        title: item.title,
        subtitle: item.subtitle ?? null,
        shortLabel: item.shortLabel ?? null,
      })),
    };
  }

  return db.certificate.update({
    where: { id },
    data,
    select: { id: true, status: true },
  });
}

export async function submitForReviewCertificate(
  id: string
): Promise<{ id: string; status: CertificateStatus }> {
  return db.certificate.update({
    where: { id },
    data: { status: "PENDING_ISSUE" },
    select: { id: true, status: true },
  });
}

export async function returnCertificateToDraft(
  id: string
): Promise<{ id: string; status: CertificateStatus }> {
  return db.certificate.update({
    where: { id },
    data: { status: "DRAFT" },
    select: { id: true, status: true },
  });
}

/**
 * The v2 certificate design has exactly four fixed module rows, so issuance must not
 * hand out an issued certificate whose PDF can never be rendered. The write validator
 * already enforces this for draft edits; this covers rows written before the rule
 * existed and any other caller that reaches the DAL directly.
 */
async function assertIssuableModuleCount(id: string): Promise<void> {
  const itemCount = await db.certificateItem.count({ where: { certificateId: id } });
  if (itemCount !== REQUIRED_MODULE_COUNT) {
    throw new Error(
      `Certificate has ${itemCount} modules; exactly ${REQUIRED_MODULE_COUNT} are required before it can be issued.`
    );
  }
}

export async function issueCertificate(
  values: IssueCertificateInput
): Promise<{ id: string; status: CertificateStatus }> {
  const issueDateParsed = parseOptionalDate(values.issueDate);
  const now = new Date();

  await assertIssuableModuleCount(values.id);

  return db.certificate.update({
    where: { id: values.id },
    data: {
      certificateNumber: values.certificateNumber,
      verificationToken: values.verificationToken,
      status: "ISSUED",
      issueDate: issueDateParsed,
      issuedAt: now,
      pdfUrl: values.pdfUrl ?? null,
      issuedSignatories: {
        deleteMany: {},
        create: values.issuedSignatories.map((sig) => ({
          // Checked form: this update also writes `issuedSignatories` nested, so a
          // scalar `signatoryId` is rejected at runtime.
          signatory: sig.signatoryId ? { connect: { id: sig.signatoryId } } : undefined,
          name: sig.name,
          title: sig.title,
          designation: sig.designation,
          displayOrder: sig.displayOrder,
        })),
      },
    },
    select: { id: true, status: true },
  });
}

export async function revokeCertificate(
  values: RevokeCertificateInput
): Promise<{ id: string; status: CertificateStatus }> {
  return db.certificate.update({
    where: { id: values.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokeCategory: values.revokeCategory,
      revokeReason: values.revokeReason,
    },
    select: { id: true, status: true },
  });
}

export async function reissueCertificate(
  values: ReissueCertificateInput
): Promise<{ id: string; status: CertificateStatus }> {
  const existing = await db.certificate.findUniqueOrThrow({
    where: { id: values.id },
    select: {
      id: true,
      recipientName: true,
      recipientIdNumber: true,
      courseId: true,
      courseName: true,
      completionDate: true,
      grade: true,
      programDuration: true,
      templateId: true,
      createdById: true,
      metadata: true,
      items: true,
    },
  });

  const now = new Date();
  const issueDateParsed = parseOptionalDate(values.issueDate);

  // The snapshot is about to be cloned into a freshly issued certificate, so the
  // module count must be valid before anything is written.
  if (existing.items.length !== REQUIRED_MODULE_COUNT) {
    throw new Error(
      `Certificate has ${existing.items.length} modules; exactly ${REQUIRED_MODULE_COUNT} are required before it can be reissued.`
    );
  }

  const [, reissued] = await db.$transaction([
    db.certificate.update({
      where: { id: values.id },
      data: {
        status: "REISSUED",
        reissuedAt: now,
        reissueReason: values.reissueReason,
      },
      select: { id: true },
    }),
    db.certificate.create({
      data: {
        certificateNumber: values.certificateNumber,
        verificationToken: values.verificationToken,
        status: "ISSUED",
        recipientName: existing.recipientName,
        recipientIdNumber: existing.recipientIdNumber,
        courseName: existing.courseName,
        completionDate: existing.completionDate,
        grade: existing.grade,
        programDuration: existing.programDuration,
        issueDate: issueDateParsed,
        issuedAt: now,
        pdfUrl: values.pdfUrl ?? null,
        metadata: existing.metadata as Prisma.InputJsonValue,
        // Checked relation form: this create also writes `items` and
        // `issuedSignatories` nested, so scalar FKs are rejected at runtime.
        course: existing.courseId ? { connect: { id: existing.courseId } } : undefined,
        template: existing.templateId
          ? { connect: { id: existing.templateId } }
          : undefined,
        parentCertificate: { connect: { id: existing.id } },
        createdBy: existing.createdById
          ? { connect: { id: existing.createdById } }
          : undefined,
        items: {
          create: existing.items.map((item) => ({
            order: item.order,
            title: item.title,
            subtitle: item.subtitle,
            shortLabel: item.shortLabel,
          })),
        },
        issuedSignatories: {
          create: values.issuedSignatories.map((sig) => ({
            signatory: sig.signatoryId
              ? { connect: { id: sig.signatoryId } }
              : undefined,
            name: sig.name,
            title: sig.title,
            designation: sig.designation,
            displayOrder: sig.displayOrder,
          })),
        },
      },
      select: { id: true, status: true },
    }),
  ]);

  return reissued;
}

export async function regenerateCertificatePdf(
  id: string,
  pdfUrl: string
): Promise<{ id: string }> {
  return db.certificate.update({
    where: { id },
    data: { pdfUrl },
    select: { id: true },
  });
}

export async function countCertificatesByStatus(): Promise<
  Record<CertificateStatus, number>
> {
  const grouped = await db.certificate.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const counts: Record<string, number> = {
    DRAFT: 0,
    PENDING_ISSUE: 0,
    ISSUED: 0,
    REVOKED: 0,
    REISSUED: 0,
    EXPIRED: 0,
  };

  for (const row of grouped) {
    counts[row.status] = row._count._all;
  }
  return counts as Record<CertificateStatus, number>;
}

export function buildPdfDataForCertificate(params: {
  id: string;
  certificateNumber: string;
  verificationToken: string;
  recipientName: string;
  courseName: string;
  issueDateIso: string | null;
  completionDateIso?: string | null;
  grade?: string | null;
  programDuration?: string | null;
  courseDurationWeeks?: number | null;
  items: Array<{ order: number; title: string; subtitle: string | null; shortLabel: string | null }>;
  issuedSignatories: Array<{ name: string; title: string; designation: string; displayOrder: number }>;
  metadata: Record<string, unknown> | null;
  baseUrl?: string;
}): PdfCertificateData {
  const base = (params.baseUrl ?? resolveOfficialDomain()).replace(/\/$/, "");
  const verificationUrl = `${base}/verify/${params.verificationToken}`;

  // `grade` and `programDuration` are real columns. Metadata keys are still honoured
  // as a fallback for rows written before those columns existed.
  const meta = (params.metadata ?? {}) as Record<string, unknown>;
  const grade =
    params.grade?.trim() ||
    (typeof meta.grade === "string" ? meta.grade : null) ||
    (typeof meta.finalGrade === "string" ? meta.finalGrade : null) ||
    null;
  const programDurationText =
    params.programDuration?.trim() ||
    (typeof meta.programDurationText === "string" ? meta.programDurationText : null) ||
    (typeof meta.duration === "string" ? meta.duration : null) ||
    null;
  const providerName =
    typeof meta.providerName === "string" ? meta.providerName : null;

  let contactWebsite: string | null = null;
  let contactEmail: string | null = null;
  let contactPhone: string | null = null;
  const contact = meta.contact;
  if (contact && typeof contact === "object") {
    const c = contact as Record<string, unknown>;
    if (typeof c.website === "string") contactWebsite = c.website;
    if (typeof c.email === "string") contactEmail = c.email;
    if (typeof c.phone === "string") contactPhone = c.phone;
  }

  return {
    id: params.id,
    certificateNumber: params.certificateNumber,
    verificationToken: params.verificationToken,
    recipientName: params.recipientName,
    courseName: params.courseName,
    issueDateIso: params.issueDateIso,
    completionDateIso: params.completionDateIso ?? null,
    courseDurationWeeks: params.courseDurationWeeks ?? null,
    verificationUrl,
    items: params.items
      .map((it) => ({
        order: it.order,
        title: it.title,
        subtitle: it.subtitle,
        shortLabel: it.shortLabel,
      }))
      .sort((a, b) => a.order - b.order),
    issuedSignatories: params.issuedSignatories
      .map((s) => ({
        name: s.name,
        title: s.title,
        designation: s.designation,
        displayOrder: s.displayOrder,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder),
    grade,
    programDurationText,
    providerName,
    contactInfo: {
      website: contactWebsite,
      email: contactEmail,
      phone: contactPhone,
    },
  };
}

export async function adminBuildPdfDataForCertificate(
  id: string,
  baseUrl?: string
): Promise<PdfCertificateData | null> {
  const row = await db.certificate.findUnique({
    where: { id },
    include: {
      items: { orderBy: { order: "asc" } },
      issuedSignatories: { orderBy: { displayOrder: "asc" } },
      course: { select: { durationWeeks: true } },
    },
  });
  if (!row) return null;
  if (!row.certificateNumber || !row.verificationToken) return null;

  return buildPdfDataForCertificate({
    id: row.id,
    certificateNumber: row.certificateNumber,
    verificationToken: row.verificationToken,
    recipientName: row.recipientName,
    courseName: row.courseName,
    issueDateIso: row.issueDate ? row.issueDate.toISOString() : null,
    completionDateIso: row.completionDate ? row.completionDate.toISOString() : null,
    grade: row.grade,
    programDuration: row.programDuration,
    courseDurationWeeks: row.course?.durationWeeks ?? null,
    items: row.items,
    issuedSignatories: row.issuedSignatories,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    baseUrl,
  });
}

/**
 * Render-input for the admin preview (before a certificate is ever persisted).
 * The identity is always a placeholder: the caller supplies the number that would
 * next be minted plus a preview-only token, and the signatories/issue date come
 * from the dialog the admin is about to confirm. Nothing is written to the DB.
 */
export async function adminBuildPreviewPdfData(
  id: string,
  opts: {
    certificateNumber: string;
    verificationToken: string;
    baseUrl?: string;
    issueDateIso?: string | null;
    issuedSignatories: CertificateIssuedSignatoryInput[];
  }
): Promise<PdfCertificateData | null> {
  const row = await db.certificate.findUnique({
    where: { id },
    include: {
      items: { orderBy: { order: "asc" } },
      course: { select: { durationWeeks: true } },
    },
  });
  if (!row) return null;

  return buildPdfDataForCertificate({
    id: row.id,
    certificateNumber: opts.certificateNumber,
    verificationToken: opts.verificationToken,
    recipientName: row.recipientName,
    courseName: row.courseName,
    issueDateIso: opts.issueDateIso ?? (row.issueDate ? row.issueDate.toISOString() : null),
    completionDateIso: row.completionDate ? row.completionDate.toISOString() : null,
    grade: row.grade,
    programDuration: row.programDuration,
    courseDurationWeeks: row.course?.durationWeeks ?? null,
    items: row.items,
    issuedSignatories: opts.issuedSignatories.map((sig) => ({
      name: sig.name,
      title: sig.title,
      designation: sig.designation,
      displayOrder: sig.displayOrder,
    })),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    baseUrl: opts.baseUrl,
  });
}

export type GeneratePdfOptions = {
  trainingProvider?: string;
  /** Printed in the duration sentence when the certificate has no stored duration. */
  programDurationFallback?: string | null;
};

export async function generateAndPersistPdfForCertificate(
  id: string,
  opts: GeneratePdfOptions = {}
): Promise<PdfPersistResult> {
  const [pdfData, settings] = await Promise.all([
    adminBuildPdfDataForCertificate(id),
    getSiteSettings().catch(() => null),
  ]);
  if (!pdfData) {
    return { ok: false, error: "Certificate not ready for PDF generation" };
  }

  const trainingProvider =
    opts.trainingProvider ?? settings?.general?.name ?? undefined;

  return generateAndPersistCertificatePdf(pdfData, {
    trainingProvider,
    programDurationFallback:
      opts.programDurationFallback ?? durationFromWeeks(pdfData.courseDurationWeeks),
  });
}

export async function updateCertificatePdfUrl(
  id: string,
  pdfUrl: string
): Promise<{ id: string; pdfUrl: string | null }> {
  return db.certificate.update({
    where: { id },
    data: { pdfUrl },
    select: { id: true, pdfUrl: true },
  });
}
