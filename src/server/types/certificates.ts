import type {
  CertificateStatus,
  Certificate,
  CertificateSignatory,
  CertificateTemplate,
  CertificateItem,
  CertificateIssuedSignatory,
} from "@/generated/prisma/client";

export type CertificateStatusValue = CertificateStatus;

export const CERTIFICATE_STATUSES = [
  "DRAFT",
  "PENDING_ISSUE",
  "ISSUED",
  "REVOKED",
  "REISSUED",
  "EXPIRED",
] as const;

/**
 * Revocation categories (spec "Revocation UX"): the confirm dialog requires exactly
 * one of these alongside a free-text reason, so the why can be aggregated later.
 * Backed by a nullable varchar column; the values are enforced here, never in a form.
 */
export const REVOKE_CATEGORY_VALUES = [
  "DATA_ERROR",
  "DUPLICATE",
  "FRAUD",
  "ADMINISTRATIVE_ERROR",
  "STUDENT_REQUEST",
  "OTHER",
] as const;

export const REVOKE_CATEGORY_OPTIONS = [
  { value: "DATA_ERROR", label: "Data Error" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "FRAUD", label: "Fraud" },
  { value: "ADMINISTRATIVE_ERROR", label: "Administrative Error" },
  { value: "STUDENT_REQUEST", label: "Student Request" },
  { value: "OTHER", label: "Other" },
] as const;

export type RevokeCategoryValue = (typeof REVOKE_CATEGORY_VALUES)[number];

export function revokeCategoryLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return REVOKE_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? null;
}

export type CertificateItemInput = {
  id?: string;
  order: number;
  title: string;
  subtitle?: string | null;
  shortLabel?: string | null;
};

export type CertificateIssuedSignatoryInput = {
  id?: string;
  signatoryId?: string | null;
  name: string;
  title: string;
  designation: string;
  displayOrder: number;
};

export type CreateCertificateInput = {
  recipientName: string;
  recipientIdNumber?: string | null;
  courseId?: string | null;
  courseName: string;
  completionDate?: string | null;
  issueDate?: string | null;
  grade?: string | null;
  programDuration?: string | null;
  templateId?: string | null;
  items?: CertificateItemInput[];
  metadata?: Record<string, unknown> | null;
};

export type UpdateCertificateInput = {
  recipientName?: string;
  recipientIdNumber?: string | null;
  courseId?: string | null;
  courseName?: string;
  completionDate?: string | null;
  issueDate?: string | null;
  grade?: string | null;
  programDuration?: string | null;
  templateId?: string | null;
  status?: CertificateStatusValue;
  items?: CertificateItemInput[];
  metadata?: Record<string, unknown> | null;
  pdfUrl?: string | null;
};

/**
 * Issue request. The certificate number and verification token are NOT inputs:
 * they are minted inside the issuing transaction (docs 02 B2/B3), so the caller
 * cannot propose an identity and two concurrent issues cannot collide.
 */
export type IssueCertificateInput = {
  id: string;
  issueDate?: string | null;
  issuedSignatories: CertificateIssuedSignatoryInput[];
  pdfUrl?: string | null;
};

export type RevokeCertificateInput = {
  id: string;
  revokeCategory: RevokeCategoryValue;
  revokeReason: string;
};

/** Reissue request; likewise, the new certificate's identity is server-minted. */
export type ReissueCertificateInput = {
  id: string;
  reissueReason: string;
  issueDate?: string | null;
  issuedSignatories: CertificateIssuedSignatoryInput[];
  pdfUrl?: string | null;
};

export type CertificateFilters = {
  q?: string;
  status?: CertificateStatusValue;
  courseId?: string;
  page: number;
};

export type PaginationMeta = {
  total: number;
  page: number;
  pageCount: number;
};

export type PublicVerifyView = {
  certificateNumber: string;
  status: CertificateStatusValue;
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

export type AdminCertificateListRow = {
  id: string;
  certificateNumber: string | null;
  recipientName: string;
  courseName: string;
  status: CertificateStatusValue;
  issueDate: string | null;
  issuedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminCertificateListResult = {
  rows: AdminCertificateListRow[];
} & PaginationMeta;

export type AdminCertificateDetail = {
  id: string;
  certificateNumber: string | null;
  verificationToken: string | null;
  status: CertificateStatusValue;
  recipientName: string;
  recipientIdNumber: string | null;
  courseId: string | null;
  courseName: string;
  completionDate: string | null;
  issueDate: string | null;
  grade: string | null;
  programDuration: string | null;
  issuedAt: string | null;
  revokedAt: string | null;
  reissuedAt: string | null;
  revokeCategory: string | null;
  revokeReason: string | null;
  reissueReason: string | null;
  templateId: string | null;
  parentCertificateId: string | null;
  pdfUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  items: CertificateItem[];
  issuedSignatories: CertificateIssuedSignatory[];
};

export type SignatoryWriteInput = {
  id?: string;
  name: string;
  title: string;
  designation: string;
  signatureUrl?: string | null;
  isActive?: boolean;
  displayOrder?: number;
};

export type TemplateWriteInput = {
  id?: string;
  name: string;
  version: string;
  layoutConfig?: Record<string, unknown> | null;
  isActive?: boolean;
};

export type SignatoryFilters = {
  q?: string;
  isActive?: boolean;
  page: number;
};

export type TemplateFilters = {
  q?: string;
  isActive?: boolean;
  page: number;
};

export type {
  CertificateSignatory,
  CertificateTemplate,
  Certificate,
  CertificateItem,
  CertificateIssuedSignatory,
};
