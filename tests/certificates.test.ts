import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  certificateWriteSchema,
  issueCertificateSchema,
  reissueCertificateSchema,
  revokeCertificateSchema,
  signatoryWriteSchema,
  templateWriteSchema,
} from "../src/lib/validators/certificates";

/**
 * The admin forms run these schemas as a client-side `zodResolver` and then forward
 * the resolver's *transformed output* to a server action that parses it again. Every
 * schema must therefore be idempotent: parsing its own output a second time has to
 * succeed and yield the same value. Optional fields that normalise to `null` used to
 * break this, which made every create/save with an empty optional field fail.
 */
function reparse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const first = schema.safeParse(raw);
  expect(first.success, "first parse should succeed").toBe(true);
  const second = schema.safeParse(first.data);
  expect(
    second.success,
    `re-parse should succeed, got: ${
      second.success ? "" : JSON.stringify(second.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))
    }`
  ).toBe(true);
  return (second as { success: true; data: z.output<S> }).data;
}

/**
 * The DarbarTech certificate template hard-codes four module rows, so the write
 * schema requires exactly four items. Every fixture below uses this helper.
 */
function fourModules() {
  return ["Module One", "Module Two", "Module Three", "Module Four"].map(
    (title, i) => ({ id: "", order: i, title, subtitle: "", shortLabel: "" })
  );
}

const formCertificate = {
  id: "",
  recipientName: "Aarav Sharma",
  recipientIdNumber: "",
  courseId: "cmupfad4a000mikw1ern6i2w4",
  courseName: "Digital Literacy Essentials",
  completionDate: "2026-09-04",
  issueDate: "",
  templateId: "",
  status: "DRAFT",
  items: fourModules(),
  pdfUrl: "",
};

describe("certificate validator re-parse safety", () => {
  it("survives a second parse of its own output", () => {
    const data = reparse(certificateWriteSchema, formCertificate);
    expect(data.recipientName).toBe("Aarav Sharma");
    expect(data.courseId).toBe("cmupfad4a000mikw1ern6i2w4");
  });

  it("normalises empty optional fields to null without failing", () => {
    const data = reparse(certificateWriteSchema, formCertificate);
    expect(data.templateId).toBeNull();
    expect(data.recipientIdNumber).toBeNull();
    expect(data.items[0].subtitle).toBeNull();
    expect(data.items[0].shortLabel).toBeNull();
  });

  it("is stable across a third parse", () => {
    const twice = reparse(certificateWriteSchema, formCertificate);
    const thrice = reparse(certificateWriteSchema, twice);
    expect(thrice).toEqual(twice);
  });

  it("handles a fully bare payload", () => {
    const data = reparse(certificateWriteSchema, {
      ...formCertificate,
      courseId: "",
      completionDate: "",
      issueDate: "",
    });
    expect(data.courseId).toBeNull();
    expect(data.items).toHaveLength(4);
  });

  it("re-parses the issue schema", () => {
    const data = reparse(issueCertificateSchema, {
      id: "cmupfad4a000mikw1ern6i2w4",
      certificateNumber: "DC-2026-001",
      verificationToken: "abcdefghij0123456789",
      issueDate: "",
      issuedSignatories: [
        {
          id: "",
          signatoryId: "",
          name: "Institute Director",
          title: "Executive Director",
          designation: "Director",
          displayOrder: 0,
        },
      ],
      pdfUrl: "",
    });
    expect(data.issuedSignatories[0].signatoryId).toBeNull();
  });

  it("re-parses the reissue schema", () => {
    reparse(reissueCertificateSchema, {
      id: "cmupfad4a000mikw1ern6i2w4",
      reissueReason: "Corrected name",
      certificateNumber: "DC-2026-002",
      verificationToken: "abcdefghij0123456789",
      issueDate: "",
      issuedSignatories: [
        {
          id: "",
          signatoryId: "",
          name: "Institute Director",
          title: "Executive Director",
          designation: "Director",
          displayOrder: 0,
        },
      ],
      pdfUrl: "",
    });
  });

  it("re-parses the revoke schema", () => {
    reparse(revokeCertificateSchema, {
      id: "cmupfad4a000mikw1ern6i2w4",
      revokeCategory: "DATA_ERROR",
      revokeReason: "Issued in error",
    });
  });

  it("requires a revoke category", () => {
    const result = revokeCertificateSchema.safeParse({
      id: "cmupfad4a000mikw1ern6i2w4",
      revokeCategory: "",
      revokeReason: "Issued in error",
    });
    expect(result.success).toBe(false);
    const invalid = revokeCertificateSchema.safeParse({
      id: "cmupfad4a000mikw1ern6i2w4",
      revokeCategory: "NOT_A_CATEGORY",
      revokeReason: "Issued in error",
    });
    expect(invalid.success).toBe(false);
  });

  it("re-parses the signatory schema", () => {
    const data = reparse(signatoryWriteSchema, {
      id: "",
      name: "Institute Director",
      title: "Executive Director",
      designation: "Director",
      signatureUrl: "",
      isActive: true,
      displayOrder: 0,
    });
    expect(data.signatureUrl).toBeNull();
  });

  it("re-parses the template schema", () => {
    const data = reparse(templateWriteSchema, {
      id: "",
      name: "Darbar Standard A4 Landscape",
      version: "1.0",
      layoutConfig: "",
      isActive: true,
    });
    expect(data.layoutConfig).toBeNull();
  });

  it("still rejects genuinely invalid input", () => {
    expect(certificateWriteSchema.safeParse({ ...formCertificate, recipientName: "   " }).success).toBe(false);
    expect(certificateWriteSchema.safeParse({ ...formCertificate, courseName: "x".repeat(201) }).success).toBe(false);
    expect(certificateWriteSchema.safeParse({ ...formCertificate, courseId: "not a valid id!" }).success).toBe(false);
    expect(certificateWriteSchema.safeParse({ ...formCertificate, items: [{ order: 0, title: "" }] }).success).toBe(false);
    expect(issueCertificateSchema.safeParse({ ...formCertificate, verificationToken: "short" }).success).toBe(false);
  });

  /**
   * Regression guard for the template's fixed four-row module area: the design has
   * no layout for any other count, so a wrong count must never reach the renderer.
   */
  it("requires exactly four modules", () => {
    expect(
      certificateWriteSchema.safeParse({ ...formCertificate, items: [] }).success
    ).toBe(false);
    expect(
      certificateWriteSchema.safeParse({
        ...formCertificate,
        items: fourModules().slice(0, 3),
      }).success
    ).toBe(false);
    expect(
      certificateWriteSchema.safeParse({
        ...formCertificate,
        items: [...fourModules(), { id: "", order: 4, title: "Five", subtitle: "", shortLabel: "" }],
      }).success
    ).toBe(false);
    expect(
      certificateWriteSchema.safeParse({ ...formCertificate, items: fourModules() }).success
    ).toBe(true);
  });

  it("rejects a blank module title", () => {
    const items = fourModules();
    items[2].title = "   ";
    expect(certificateWriteSchema.safeParse({ ...formCertificate, items }).success).toBe(
      false
    );
  });

  it("keeps grade and program duration optional but bounded", () => {
    expect(
      certificateWriteSchema.safeParse({
        ...formCertificate,
        grade: "",
        programDuration: "",
      }).success
    ).toBe(true);

    const withGrade = certificateWriteSchema.safeParse({
      ...formCertificate,
      grade: "A+",
      programDuration: "4 Months",
    });
    expect(withGrade.success).toBe(true);
    if (withGrade.success) {
      expect(withGrade.data.grade).toBe("A+");
      expect(withGrade.data.programDuration).toBe("4 Months");
    }

    expect(
      certificateWriteSchema.safeParse({
        ...formCertificate,
        grade: "x".repeat(50),
      }).success
    ).toBe(false);
  });
});

/**
 * Regression: issuing failed for every real payload with
 * `issuedSignatories.0.id: Invalid input: expected nonoptional, received undefined`.
 *
 * Under Zod 4 a `z.union([..., z.undefined()])` member accepts `undefined` as a value,
 * but the *key* is still required when it is absent from the object. The admin signatory
 * selector has no `id` (it only holds `signatoryId`), so the dialog omitted the key
 * entirely and validation failed before the action ever reached the DAL.
 *
 * These tests pin the contract that nested optional keys may be **omitted**, not merely
 * present-and-undefined, so a form is free to send the shape it naturally holds.
 */
describe("certificate validators accept omitted optional keys", () => {
  const signatoryWithoutId = {
    signatoryId: "cmupfad4a000mikw1ern6i2w4",
    name: "Institute Director",
    title: "Executive Director",
    designation: "Director",
    displayOrder: 0,
  };

  it("issue schema accepts a signatory with no id and no signatoryId keys", () => {
    const result = issueCertificateSchema.safeParse({
      id: "cmuw1mnkd0000ysw1zechxz0u",
      certificateNumber: "DT-CERT-2026-26877",
      verificationToken: "abcdefghij0123456789",
      issueDate: "2026-10-06",
      issuedSignatories: [signatoryWithoutId],
      pdfUrl: null,
    });
    expect(
      result.success,
      result.success ? "" : JSON.stringify(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))
    ).toBe(true);
  });

  it("normalises an omitted id to an empty string and a null signatoryId", () => {
    const result = issueCertificateSchema.safeParse({
      id: "cmuw1mnkd0000ysw1zechxz0u",
      certificateNumber: "DT-CERT-2026-26877",
      verificationToken: "abcdefghij0123456789",
      issueDate: "2026-10-06",
      issuedSignatories: [{ ...signatoryWithoutId, signatoryId: undefined }],
      pdfUrl: null,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.issuedSignatories[0].id).toBe("");
    expect(result.data.issuedSignatories[0].signatoryId).toBeNull();
  });

  it("still requires at least one signatory", () => {
    expect(
      issueCertificateSchema.safeParse({
        id: "cmuw1mnkd0000ysw1zechxz0u",
        certificateNumber: "DT-CERT-2026-26877",
        verificationToken: "abcdefghij0123456789",
        issueDate: "2026-10-06",
        issuedSignatories: [],
        pdfUrl: null,
      }).success
    ).toBe(false);
  });

  it("reissue schema accepts the same omitted-key shape", () => {
    const result = reissueCertificateSchema.safeParse({
      id: "cmuw1mnkd0000ysw1zechxz0u",
      reissueReason: "Corrected recipient name",
      certificateNumber: "DT-CERT-2026-26878",
      verificationToken: "abcdefghij0123456789",
      issueDate: "2026-10-06",
      issuedSignatories: [signatoryWithoutId],
      pdfUrl: null,
    });
    expect(
      result.success,
      result.success ? "" : JSON.stringify(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))
    ).toBe(true);
  });

  it("certificate write schema accepts items with no id key", () => {
    const result = certificateWriteSchema.safeParse({
      ...formCertificate,
      items: fourModules().map(({ order, title }) => ({ order, title })),
    });
    expect(
      result.success,
      result.success ? "" : JSON.stringify(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))
    ).toBe(true);
    if (result.success) expect(result.data.items[0].id).toBe("");
  });

  it("omitted keys and explicit empties produce the same result", () => {
    const omitted = issueCertificateSchema.safeParse({
      id: "cmuw1mnkd0000ysw1zechxz0u",
      certificateNumber: "DT-CERT-2026-26877",
      verificationToken: "abcdefghij0123456789",
      issueDate: "2026-10-06",
      issuedSignatories: [signatoryWithoutId],
      pdfUrl: null,
    });
    const explicit = issueCertificateSchema.safeParse({
      id: "cmuw1mnkd0000ysw1zechxz0u",
      certificateNumber: "DT-CERT-2026-26877",
      verificationToken: "abcdefghij0123456789",
      issueDate: "2026-10-06",
      issuedSignatories: [{ ...signatoryWithoutId, id: "" }],
      pdfUrl: null,
    });
    expect(omitted.success && explicit.success).toBe(true);
    if (omitted.success && explicit.success) {
      expect(omitted.data).toEqual(explicit.data);
    }
  });

  it("survives a re-parse of the omitted-key output", () => {
    const data = reparse(issueCertificateSchema, {
      id: "cmuw1mnkd0000ysw1zechxz0u",
      certificateNumber: "DT-CERT-2026-26877",
      verificationToken: "abcdefghij0123456789",
      issueDate: "2026-10-06",
      issuedSignatories: [signatoryWithoutId],
      pdfUrl: null,
    });
    expect(data.issuedSignatories[0].id).toBe("");
  });
});
