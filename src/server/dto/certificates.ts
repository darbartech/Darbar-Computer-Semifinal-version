import "server-only";
import type {
  Certificate,
  CertificateItem,
  CertificateIssuedSignatory,
} from "@/generated/prisma/client";
import type {
  PublicVerifyView,
  AdminCertificateListRow,
  AdminCertificateDetail,
} from "../types/certificates";

function parseDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

type CertificateWithIncludes = Certificate & {
  items: CertificateItem[];
  issuedSignatories: CertificateIssuedSignatory[];
};

export type PublicVerifyDTO = {
  certificateNumber: string;
  status: Certificate["status"];
  recipientName: string;
  courseName: string;
  issueDate: string | null;
  issuedAt: string | null;
  revokedAt: string | null;
  reissuedAt: string | null;
  issuedSignatories: Array<{
    name: string;
    title: string;
  }>;
  verificationUrl: string;
  items: Array<{
    order: number;
    title: string;
    subtitle: string | null;
  }>;
};

export function mapToPublicVerify(
  certificate: CertificateWithIncludes,
  baseUrl: string
): PublicVerifyView {
  const issuedSignatories = certificate.issuedSignatories
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((signatory) => ({
      name: signatory.name,
      title: signatory.title,
    }));

  const items = certificate.items
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      order: item.order,
      title: item.title,
      subtitle: item.subtitle ?? null,
    }));

  return {
    certificateNumber: certificate.certificateNumber ?? "",
    status: certificate.status,
    recipientName: certificate.recipientName,
    courseName: certificate.courseName,
    issueDate: parseDate(certificate.issueDate),
    issuedAt: parseDate(certificate.issuedAt),
    revokedAt: parseDate(certificate.revokedAt),
    reissuedAt: parseDate(certificate.reissuedAt),
    issuedSignatories,
    verificationUrl: `${baseUrl}/verify/${certificate.verificationToken}`,
    items,
  };
}

export function mapToAdminList(
  row: Pick<
    Certificate,
    | "id"
    | "certificateNumber"
    | "recipientName"
    | "courseName"
    | "status"
    | "issueDate"
    | "issuedAt"
    | "revokedAt"
    | "createdAt"
    | "updatedAt"
  >
): AdminCertificateListRow {
  return {
    id: row.id,
    certificateNumber: row.certificateNumber ?? null,
    recipientName: row.recipientName,
    courseName: row.courseName,
    status: row.status,
    issueDate: parseDate(row.issueDate),
    issuedAt: parseDate(row.issuedAt),
    revokedAt: parseDate(row.revokedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapToAdminDetail(
  row: CertificateWithIncludes
): AdminCertificateDetail {
  return {
    id: row.id,
    certificateNumber: row.certificateNumber ?? null,
    verificationToken: row.verificationToken ?? null,
    status: row.status,
    recipientName: row.recipientName,
    recipientIdNumber: row.recipientIdNumber ?? null,
    courseId: row.courseId ?? null,
    courseName: row.courseName,
    completionDate: parseDate(row.completionDate),
    issueDate: parseDate(row.issueDate),
    grade: row.grade ?? null,
    programDuration: row.programDuration ?? null,
    issuedAt: parseDate(row.issuedAt),
    revokedAt: parseDate(row.revokedAt),
    reissuedAt: parseDate(row.reissuedAt),
    revokeCategory: row.revokeCategory ?? null,
    revokeReason: row.revokeReason ?? null,
    reissueReason: row.reissueReason ?? null,
    templateId: row.templateId ?? null,
    parentCertificateId: row.parentCertificateId ?? null,
    pdfUrl: row.pdfUrl ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdById: row.createdById ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.sort((a, b) => a.order - b.order),
    issuedSignatories: row.issuedSignatories.sort(
      (a, b) => a.displayOrder - b.displayOrder
    ),
  };
}
