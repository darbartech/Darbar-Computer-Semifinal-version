import { z } from "zod";
import {
  isCertificateNumber,
  tokenFromReference,
} from "@/lib/certificate-reference";
import {
  turnstileTokenSchema,
  cuidLike,
  optionalDateString,
  pageParamSchema,
} from "./shared";
import {
  CERTIFICATE_STATUSES,
  REVOKE_CATEGORY_VALUES,
} from "@/server/types/certificates";

export const CERTIFICATE_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_ISSUE", label: "Pending Issue" },
  { value: "ISSUED", label: "Issued" },
  { value: "REVOKED", label: "Revoked" },
  { value: "REISSUED", label: "Reissued" },
  { value: "EXPIRED", label: "Expired" },
] as const;

/** Letter grades selectable from the draft form; the raw value prints in the badge. */
export const GRADE_OPTIONS = [
  { value: "A+", label: "A+ (Distinction)" },
  { value: "A", label: "A (Excellent)" },
  { value: "B+", label: "B+ (Very Good)" },
  { value: "B", label: "B (Good)" },
  { value: "C+", label: "C+ (Satisfactory)" },
  { value: "C", label: "C (Acceptable)" },
  { value: "D", label: "D (Marginal)" },
  { value: "E", label: "E (Improvement Needed)" },
  { value: "F", label: "F (Fail)" },
] as const;

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max} characters)`);

const optionalText = (max: number, label?: string) =>
  z
    .string()
    .trim()
    .max(max, `${label ?? "This field"} is too long (max ${max} characters)`)
    .nullish()
    .transform((value) => (value ? value : null));

// Under Zod 4 a `z.union([..., z.undefined()])` member accepts `undefined` as a
// *value* but the key is still treated as required when absent, so nested form rows
// that omit `id`/`signatoryId` fail with "expected nonoptional". `.optional()` on the
// union marks the key itself optional; the transform then normalises the result.
const optionalCuid = z
  .union([cuidLike, z.literal(""), z.null()])
  .optional()
  .transform((value) => (typeof value === "string" && value ? value : null));

const optionalCuidOrEmpty = z
  .union([cuidLike, z.literal(""), z.null()])
  .optional()
  .transform((value) => (typeof value === "string" ? value : ""));

const boolFromForm = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0", "on"])])
  .transform((value) => value === true || value === "true" || value === "1" || value === "on");

/**
 * The DarbarTech certificate template hard-codes four module rows
 * (module1Title … module4Title), so exactly four is a design constraint rather than a
 * preference. Enforced on every draft write so a certificate can never reach the
 * renderer with a module count it cannot lay out.
 */
export const REQUIRED_MODULE_COUNT = 4;

export const certificateItemSchema = z.object({
  id: optionalCuidOrEmpty,
  order: z.coerce.number().int().min(0).max(9999).default(0).catch(0),
  title: requiredText(200, "Module title"),
  subtitle: optionalText(200, "Module subtitle"),
  shortLabel: optionalText(60, "Short label"),
});

export const issuedSignatorySchema = z.object({
  id: optionalCuidOrEmpty,
  signatoryId: optionalCuid,
  name: requiredText(120, "Signatory name"),
  title: requiredText(120, "Signatory title"),
  designation: requiredText(120, "Signatory designation"),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0).catch(0),
});

/**
 * Draft write shape. Status, certificate number, verification token and PDF URL are
 * deliberately NOT part of it — they are system-managed through the issue / revoke /
 * reissue lifecycle, never hand-edited in a form. `createCertificate` also forces
 * status DRAFT regardless of what a caller sends.
 */
export const certificateWriteSchema = z.object({
  id: optionalCuidOrEmpty,
  recipientName: requiredText(160, "Recipient name"),
  recipientIdNumber: optionalText(80, "Recipient ID"),
  courseId: optionalCuid,
  courseName: requiredText(200, "Course name"),
  completionDate: optionalDateString.nullish(),
  issueDate: optionalDateString.nullish(),
  grade: optionalText(20, "Grade"),
  programDuration: optionalText(60, "Program duration"),
  templateId: optionalCuid,
  items: z
    .array(certificateItemSchema)
    .length(
      REQUIRED_MODULE_COUNT,
      `The certificate design requires exactly ${REQUIRED_MODULE_COUNT} modules`
    ),
});

export type CertificateWriteInput = z.input<typeof certificateWriteSchema>;
export type CertificateWriteValues = z.output<typeof certificateWriteSchema>;

/**
 * Issue confirmation. The certificate number, verification token and PDF URL are
 * generated on the server during issuance, so the client only confirms the date and
 * the signatory responsibilities.
 */
export const issueCertificateSchema = z.object({
  id: cuidLike,
  issueDate: optionalDateString.nullish(),
  issuedSignatories: z
    .array(issuedSignatorySchema)
    .min(1, "At least one signatory is required")
    .max(5, "Maximum 5 signatories allowed"),
});

export type IssueCertificateValidationInput = z.input<typeof issueCertificateSchema>;
export type IssueCertificateValidationValues = z.output<typeof issueCertificateSchema>;

/**
 * Draft preview request (render before issuance, never persisted). Same shape as
 * the issue confirmation minus the id — the route resolves the record and mints a
 * placeholder number/token itself.
 */
export const certificatePreviewSchema = z.object({
  issueDate: optionalDateString.nullish(),
  issuedSignatories: issueCertificateSchema.shape.issuedSignatories,
});

export type CertificatePreviewValidationInput = z.input<typeof certificatePreviewSchema>;
export type CertificatePreviewValidationValues = z.output<typeof certificatePreviewSchema>;

/**
 * Public certificate search (docs 01 §S7).
 *
 * A verification token — typed by hand or inside a pasted `…/verify/<token>` link —
 * is 24 random bytes, so it proves itself and needs nothing more. A printed
 * certificate number is sequential underneath its random suffix, so manual search
 * requires the recipient's full name as the second factor. Anything that is neither
 * shape is rejected before it reaches the database.
 *
 * Split like the contact form: `…FormSchema` is what the browser validates (no
 * Turnstile token yet), `…Schema` is what the Server Action validates.
 */
const certificateSearchFields = {
  code: z
    .string()
    .trim()
    .min(1, "Enter the certificate number or verification code")
    .max(128, "That value is too long to be a certificate reference"),
  recipientName: z
    .string()
    .trim()
    .max(120, "That name is too long")
    .optional()
    .or(z.literal("")),
};

type SearchInput = { code: string; recipientName?: string };
type SearchIssue = { code: "custom"; path: string[]; message: string };

/**
 * Both schema halves share this rule. Returning the problems instead of pushing them
 * keeps the rule callable from the browser as well as the Server Action, without
 * depending on zod's internal refinement-context type.
 */
function certificateSearchProblems(
  value: SearchInput
): Array<{ field: "code" | "recipientName"; message: string }> {
  if (tokenFromReference(value.code)) return [];

  const problems: Array<{ field: "code" | "recipientName"; message: string }> = [];
  if (!isCertificateNumber(value.code)) {
    return [
      {
        field: "code",
        message: "Enter the certificate number or the verification code from the QR link",
      },
    ];
  }
  if (!value.recipientName?.trim()) {
    problems.push({
      field: "recipientName",
      message: "Enter the recipient's full name exactly as printed on the certificate",
    });
  }
  return problems;
}

function rejectSearch(
  value: SearchInput,
  ctx: { addIssue: (issue: SearchIssue) => void }
): void {
  for (const problem of certificateSearchProblems(value)) {
    ctx.addIssue({
      code: "custom",
      path: [problem.field],
      message: problem.message,
    });
  }
}

export const certificateSearchFormSchema = z
  .object(certificateSearchFields)
  .superRefine(rejectSearch);

export const certificateSearchSchema = z
  .object({ ...certificateSearchFields, turnstileToken: turnstileTokenSchema })
  .superRefine(rejectSearch);

export type CertificateSearchInput = z.input<typeof certificateSearchSchema>;
export type CertificateSearchValues = z.output<typeof certificateSearchSchema>;

export const revokeCertificateSchema = z.object({
  id: cuidLike,
  revokeCategory: z.enum(REVOKE_CATEGORY_VALUES, {
    error: "Revocation category is required",
  }),
  revokeReason: requiredText(500, "Revocation reason"),
});

export type RevokeCertificateValidationInput = z.input<typeof revokeCertificateSchema>;
export type RevokeCertificateValidationValues = z.output<typeof revokeCertificateSchema>;

export const reissueCertificateSchema = z.object({
  id: cuidLike,
  reissueReason: requiredText(500, "Reissue reason"),
  issueDate: optionalDateString.nullish(),
  issuedSignatories: z
    .array(issuedSignatorySchema)
    .min(1, "At least one signatory is required")
    .max(5, "Maximum 5 signatories allowed"),
});

export type ReissueCertificateValidationInput = z.input<typeof reissueCertificateSchema>;
export type ReissueCertificateValidationValues = z.output<typeof reissueCertificateSchema>;

export const signatoryWriteSchema = z.object({
  id: optionalCuidOrEmpty,
  name: requiredText(120, "Name"),
  title: requiredText(120, "Title"),
  designation: requiredText(120, "Designation"),
  signatureUrl: optionalText(500, "Signature URL"),
  isActive: boolFromForm.default(true),
  displayOrder: z.coerce.number().int().min(0).max(9999).default(0).catch(0),
});

export type SignatoryWriteInput = z.input<typeof signatoryWriteSchema>;
export type SignatoryWriteValues = z.output<typeof signatoryWriteSchema>;

export const templateWriteSchema = z.object({
  id: optionalCuidOrEmpty,
  name: requiredText(120, "Template name"),
  version: requiredText(40, "Version"),
  layoutConfig: z
    .string()
    .trim()
    .nullish()
    .transform((value) => {
      if (!value) return null;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return null;
      }
    }),
  isActive: boolFromForm.default(true),
});

export type TemplateWriteInput = z.input<typeof templateWriteSchema>;
export type TemplateWriteValues = z.output<typeof templateWriteSchema>;

export const certificateFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(CERTIFICATE_STATUSES).optional().catch(undefined),
  courseId: cuidLike.optional().catch(undefined),
  page: pageParamSchema,
});

export type CertificateFilters = z.infer<typeof certificateFilterSchema>;
export const CERTIFICATE_PAGE_SIZE = 25;

export const signatoryFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .transform((value) => value === true || value === "true" || value === "1")
    .optional()
    .catch(undefined),
  page: pageParamSchema,
});

export type SignatoryFilters = z.infer<typeof signatoryFilterSchema>;
export const SIGNATORY_PAGE_SIZE = 25;

export const templateFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .transform((value) => value === true || value === "true" || value === "1")
    .optional()
    .catch(undefined),
  page: pageParamSchema,
});

export type TemplateFilters = z.infer<typeof templateFilterSchema>;
export const TEMPLATE_PAGE_SIZE = 25;

export const verifyTokenSchema = z
  .string()
  .trim()
  .min(16, "Invalid verification token")
  .max(128, "Invalid verification token")
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid verification token format");
