import "server-only";

export type PdfCertificateData = {
  id: string;
  certificateNumber: string;
  verificationToken: string;
  recipientName: string;
  courseName: string;
  issueDateIso: string | null;
  completionDateIso?: string | null;
  courseDurationWeeks?: number | null;
  verificationUrl: string;
  items: Array<{
    order: number;
    title: string;
    subtitle: string | null;
    shortLabel: string | null;
  }>;
  issuedSignatories: Array<{
    name: string;
    title: string;
    designation: string;
    displayOrder: number;
  }>;
  grade?: string | null;
  programDurationText?: string | null;
  providerName?: string | null;
  contactInfo?: {
    website?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

export type PdfGenerationResult = {
  ok: true;
  buffer: Buffer;
  byteLength: number;
} | {
  ok: false;
  error: string;
};

export type PdfPersistResult = {
  ok: true;
  pdfUrl: string;
} | {
  ok: false;
  error: string;
};
