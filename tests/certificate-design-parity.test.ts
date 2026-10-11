import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument } from "pdf-lib";
import { inflateSync } from "node:zlib";
import { renderCertificatePdf } from "@/server/certificates/pdf/engine/certificateRenderer";
import {
  getTemplateById,
  DARBARTECH_CERTIFICATE_TEMPLATE_V2,
} from "@/server/certificates/pdf/engine/templates/darbartech-certificate-v2";
import {
  toCertificateRenderInput,
  REQUIRED_MODULE_COUNT,
} from "@/server/certificates/pdf/render-input";
import { generateCertificatePdfBuffer } from "@/server/certificates/pdf/generator";
import type { PdfCertificateData } from "@/server/certificates/pdf/types";
import type { CertificateRenderInput } from "@/server/certificates/pdf/engine/types";

/**
 * Inflate every object stream in a PDF and concatenate them, so assertions can see
 * the catalog, page tree, font descriptors and Info dictionary that pdf-lib packs
 * into compressed streams.
 */
async function inflateObjectStreams(pdf: Buffer): Promise<string> {
  const buf = pdf.toString("latin1");
  const out: string[] = [];
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buf))) {
    if (!/\/Type\s*\/ObjStm/.test(m[1])) continue;
    const start = m.index + m[0].length;
    const end = buf.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      out.push(inflateSync(Buffer.from(buf.slice(start, end), "latin1")).toString("latin1"));
    } catch {
      // not a flate stream; skip
    }
  }
  return out.join("\n");
}

/**
 * `PDFDocument.load` defaults to `updateMetadata: true`, which overwrites the
 * /Producer and /Creator entries with pdf-lib's own. Pass false so the assertions
 * see what the engine actually wrote.
 */
async function loadPreservingMetadata(pdf: Buffer): Promise<PDFDocument> {
  return PDFDocument.load(pdf, { updateMetadata: false });
}

/**
 * Design parity guard.
 *
 * The certificate design is owned by the reference Certificate-Generation project
 * (v2 template + pdf-lib renderer). Darbar hosts a verbatim port, so the geometry,
 * palette, typography and field set must match the reference and must not drift.
 *
 * These tests lock the properties that make the output "that design": the four fixed
 * module rows, the A4-landscape page, the specific palette, the Montserrat/Cormorant
 * font set, the branded assets, and a real end-to-end render. If someone edits the
 * ported template or renderer, these fail.
 */

/** Byte-identical to the reference project's scripts/renderReferenceCert.ts payload. */
const AAYARA: CertificateRenderInput = {
  templateId: "darbartech-certificate",
  templateVersion: "2.0.0",
  rendererVersion: "certificate-engine 2.0.0",
  certificateNumber: "DT-CERT-2026-00125",
  recipient: { name: "AAYARA SHRESTHA" },
  program: {
    title: "PROFESSIONAL COMPUTER & DIGITAL SKILLS PROGRAM",
    duration: "4 Months",
  },
  trainingProvider: "DarbarTech Group of Technology",
  modules: [
    { order: 1, title: "COMPUTER FUNDAMENTALS", subtitle: "Basic Computer Operations" },
    { order: 2, title: "OFFICE APPLICATIONS", subtitle: "Microsoft Word | Excel | PowerPoint" },
    { order: 3, title: "GRAPHIC DESIGN", subtitle: "Adobe Photoshop | Illustrator | Canva" },
    { order: 4, title: "NEPALI TYPING", subtitle: "Unicode A – Traditional Nepali Typing" },
  ],
  grade: "A+",
  issueDate: "2026-09-11",
  signatory: { name: "Mohan Shahi", position: "Authorized Signatory" },
  secondarySignatory: { name: "Nirmala Shrestha", position: "Managing Director" },
  verificationUrl: "https://darbartech.com/verify/TEST-TOKEN",
};

const template = getTemplateById(
  DARBARTECH_CERTIFICATE_TEMPLATE_V2.templateId,
  DARBARTECH_CERTIFICATE_TEMPLATE_V2.version
);

function pdfData(overrides: Partial<PdfCertificateData> = {}): PdfCertificateData {
  return {
    id: "clx0000000000000000000000",
    certificateNumber: "DT-CERT-2026-00125",
    verificationToken: "tok0000000000000000000000000000",
    recipientName: "AAYARA SHRESTHA",
    courseName: "PROFESSIONAL COMPUTER & DIGITAL SKILLS PROGRAM",
    issueDateIso: "2026-09-11T00:00:00.000Z",
    completionDateIso: null,
    courseDurationWeeks: 16,
    verificationUrl: "https://darbartech.com/verify/TEST-TOKEN",
    items: AAYARA.modules.map((m, i) => ({
      order: i,
      title: m.title,
      subtitle: m.subtitle ?? null,
      shortLabel: null,
    })),
    issuedSignatories: [
      { name: "Mohan Shahi", title: "Authorized Signatory", designation: "", displayOrder: 0 },
      { name: "Nirmala Shrestha", title: "Managing Director", designation: "", displayOrder: 1 },
    ],
    grade: "A+",
    programDurationText: "4 Months",
    providerName: null,
    contactInfo: { website: null, email: null, phone: null },
    ...overrides,
  };
}

describe("certificate template (port of the reference v2 design)", () => {
  it("is version 2.0.0", () => {
    expect(template.version).toBe("2.0.0");
    expect(template.templateId).toBe("darbartech-certificate");
  });

  it("is A4 landscape at 300 DPI", () => {
    expect(template.page.width).toBe(297);
    expect(template.page.height).toBe(210);
    expect(template.page.unit).toBe("mm");
    expect(template.page.orientation).toBe("landscape");
    expect(template.page.dpi).toBe(300);
  });

  it("fixes the module area at exactly four modules", () => {
    expect(template.moduleConstraints.minCount).toBe(REQUIRED_MODULE_COUNT);
    expect(template.moduleConstraints.maxCount).toBe(REQUIRED_MODULE_COUNT);
    expect(REQUIRED_MODULE_COUNT).toBe(4);
  });

  it("has one hard-coded field per module slot", () => {
    for (const slot of [1, 2, 3, 4]) {
      expect(template.fields[`module${slot}Numeral`]).toBeDefined();
      expect(template.fields[`module${slot}Title`]).toBeDefined();
      expect(template.fields[`module${slot}Subtitle`]).toBeDefined();
    }
    // No fifth slot exists, which is why the count is fixed at four.
    expect(template.fields.module5Title).toBeUndefined();
  });

  it("uses the brand palette", () => {
    expect(template.colors.deepNavy.hexSrgb).toBe("#152B48");
    expect(template.colors.corporateBlue.hexSrgb).toBe("#0F668F");
    expect(template.colors.teal.hexSrgb).toBe("#0099B8");
  });

  it("prints module titles in Montserrat SemiBold and the name in Cormorant", () => {
    expect(template.moduleConstraints.item.titleFont).toBe("Montserrat-SemiBold");
    expect(template.fields.recipientName.font).toBe("CormorantGaramond-Bold");
  });

  it("points at the branded assets shipped in public/", () => {
    expect(template.staticAssets.logo).toBe("/logo.png");
    expect(template.staticAssets.watermarkLogo).toBe("/logo-small.png");
  });

  it("renders the QR from an absolute verification URL", () => {
    expect(template.qrConfig.errorCorrection).toBe("M");
    expect(() => new URL(AAYARA.verificationUrl)).not.toThrow();
  });
});

describe("render input adapter", () => {
  it("maps a stored certificate onto the reference input contract", () => {
    const mapped = toCertificateRenderInput(pdfData());
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;

    const input = mapped.input;
    expect(input.templateVersion).toBe("2.0.0");
    expect(input.certificateNumber).toBe("DT-CERT-2026-00125");
    expect(input.recipient.name).toBe("AAYARA SHRESTHA");
    expect(input.program.title).toBe(AAYARA.program.title);
    expect(input.program.duration).toBe("4 Months");
    expect(input.grade).toBe("A+");
    expect(input.issueDate).toBe("2026-09-11");
    expect(input.signatory.position).toBe("Authorized Signatory");
    expect(input.secondarySignatory?.name).toBe("Nirmala Shrestha");
    expect(input.modules.map((m) => m.title)).toEqual(
      AAYARA.modules.map((m) => m.title)
    );
  });

  /**
   * The renderer formats the date with `parseISO`, which resolves in the server's
   * local zone. A full UTC timestamp would print the wrong day west of Greenwich,
   * so the adapter must hand over a bare YYYY-MM-DD.
   */
  it("passes a bare UTC calendar date, never a timestamp", () => {
    const mapped = toCertificateRenderInput(
      pdfData({ issueDateIso: "2026-10-06T00:00:00.000Z" })
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.input.issueDate).toBe("2026-10-06");
    expect(mapped.input.issueDate).not.toContain("T");
  });

  it("omits the grade badge when no grade is set", () => {
    const mapped = toCertificateRenderInput(pdfData({ grade: null }));
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.input.grade).toBeUndefined();
  });

  it("refuses any module count the design cannot lay out", () => {
    const three = pdfData({
      items: pdfData().items.slice(0, 3).map((it, i) => ({ ...it, order: i })),
    });
    const mapped = toCertificateRenderInput(three);
    expect(mapped.ok).toBe(false);
    if (mapped.ok) return;
    expect(mapped.error).toContain("exactly 4 modules");
    expect(mapped.error).toContain("has 3");
  });

  it("refuses a certificate with no signatory", () => {
    const mapped = toCertificateRenderInput(
      pdfData({ issuedSignatories: [] })
    );
    expect(mapped.ok).toBe(false);
    if (mapped.ok) return;
    expect(mapped.error).toContain("signatory");
  });

  it("sorts modules into template slot order", () => {
    const shuffled = pdfData();
    shuffled.items = [
      { order: 2, title: "TWO", subtitle: null, shortLabel: null },
      { order: 0, title: "ONE", subtitle: null, shortLabel: null },
      { order: 3, title: "FOUR", subtitle: null, shortLabel: null },
      { order: 1, title: "THREE", subtitle: null, shortLabel: null },
    ];
    const mapped = toCertificateRenderInput(shuffled);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.input.modules.map((m) => m.title)).toEqual([
      "ONE",
      "THREE",
      "TWO",
      "FOUR",
    ]);
    expect(mapped.input.modules.map((m) => m.order)).toEqual([1, 2, 3, 4]);
  });

  it("falls back to the course duration when none is stored", () => {
    const mapped = toCertificateRenderInput(
      pdfData({ programDurationText: null }),
      { programDurationFallback: "6 Months" }
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.input.program.duration).toBe("6 Months");
  });
});

describe("reference payload renders", () => {
  // Rendering embeds six subsets of ~370 KB of TTF data, so it takes far longer than
  // Vitest's 5 s default. Render once and assert against the captured buffer.
  let pdf: Buffer;
  let result: Awaited<ReturnType<typeof renderCertificatePdf>>;

  beforeAll(async () => {
    result = await renderCertificatePdf(AAYARA, template);
    expect(result.data).toBeDefined();
    pdf = Buffer.from(result.data!);
  }, 120_000);

  it("reports no errors", () => {
    expect(result.errors ?? []).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.contentType).toBe("application/pdf");
  });

  it("is a parseable PDF", async () => {
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(50_000);
    await expect(loadPreservingMetadata(pdf)).resolves.toBeDefined();
  });

  it("is a single A4-landscape page", async () => {
    const doc = await loadPreservingMetadata(pdf);
    expect(doc.getPageCount()).toBe(1);

    const page = doc.getPage(0);
    const { width, height } = page.getSize();
    // 297 x 210 mm expressed in PostScript points (1 mm = 72/25.4 pt).
    expect(width).toBeCloseTo(841.89, 1);
    expect(height).toBeCloseTo(595.28, 1);
    expect(width).toBeGreaterThan(height);
  });

  /**
   * pdf-lib stores the catalog, page tree, font descriptors and Info dictionary inside
   * compressed object streams, so these cannot be found by scanning raw bytes. Inflate
   * every object stream first, which is how the parity check against the reference
   * project was performed.
   */
  it("embeds the branded fonts rather than falling back to Helvetica", async () => {
    const inflated = await inflateObjectStreams(pdf);
    expect(inflated).toMatch(/Montserrat/i);
    expect(inflated).toMatch(/Cormorant/i);
    expect(inflated).toContain("FontFile2");
  });

  it("stamps the certificate engine as the producer", async () => {
    const doc = await loadPreservingMetadata(pdf);
    // The engine writes these as UTF-16BE hex strings, so pdf-lib hands back a
    // leading byte-order mark.
    const stripBom = (v: string | undefined) => (v ?? "").replace(/^\uFEFF/, "");
    expect(stripBom(doc.getProducer())).toBe("DarbarTech Certificate Engine");
    expect(stripBom(doc.getCreator())).toBe("DarbarTech Certificate System");
    expect(stripBom(doc.getTitle())).toBe("Certificate DT-CERT-2026-00125");
  });

  it("renders with no missing-font fallbacks", () => {
    // A missing TTF is reported as a warning, so this proves all six shipped fonts
    // were found at the path the ported renderer expects.
    const fontWarnings = (result.warnings ?? []).filter((w) => /font/i.test(w));
    expect(fontWarnings).toEqual([]);
  });
});

describe("Darbar pipeline end to end", () => {
  it("renders a stored certificate through generateCertificatePdfBuffer", async () => {
    const result = await generateCertificatePdfBuffer(pdfData());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.byteLength).toBe(result.buffer.byteLength);
    expect(result.byteLength).toBeGreaterThan(50_000);
  }, 120_000);

  it("surfaces the four-module rule as an error instead of a broken PDF", async () => {
    const three = pdfData({
      items: pdfData().items.slice(0, 3).map((it, i) => ({ ...it, order: i })),
    });
    const result = await generateCertificatePdfBuffer(three);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("exactly 4 modules");
  });
});
