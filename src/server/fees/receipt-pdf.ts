import "server-only";
import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { amountInWords, formatNPR } from "@/lib/format";

/**
 * Receipt PDF (docs 05 §4): A5, rendered on demand and never stored — a receipt is
 * derived from the ledger row, so caching a file would let a voided payment keep
 * printing as if it were real.
 *
 * Fonts come from the same folder the certificate renderer uses. If they cannot be
 * read, the standard PDF fonts are used instead: a receipt must still print even
 * where the bundled TTFs are not reachable.
 */

const A5 = { width: 419.5, height: 595.3 } as const;
const MARGIN = 36;

const INK = rgb(0.11, 0.13, 0.17);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.88);
const BRAND = rgb(0.13, 0.28, 0.55);
/** The same red as the VOID stamp, so the wording and the mark read as one fact. */
const VOID_RED = rgb(0.72, 0.18, 0.18);

const FONT_DIR = path.join(
  process.cwd(),
  "src",
  "server",
  "certificates",
  "pdf",
  "fonts",
  "files"
);

const FONT_FILES = {
  regular: "Montserrat-Regular.ttf",
  semibold: "Montserrat-SemiBold.ttf",
  bold: "Montserrat-Bold.ttf",
} as const;

async function loadFont(
  doc: PDFDocument,
  file: keyof typeof FONT_FILES,
  fallback: StandardFonts
): Promise<PDFFont> {
  try {
    const bytes = fs.readFileSync(path.join(FONT_DIR, FONT_FILES[file]));
    return await doc.embedFont(bytes);
  } catch {
    return doc.embedFont(fallback);
  }
}

/** Day as the counter reads it: Kathmandu, `05 Nov 2026`. */
function campusDay(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kathmandu",
  }).format(value);
}

export type ReceiptPdfData = {
  receiptNo: string;
  receivedAt: Date;
  instituteName: string;
  instituteAddress?: string | null;
  invoiceNumber: string;
  invoiceTitle: string;
  courseTitle?: string | null;
  batchName?: string | null;
  studentName: string;
  studentCode: string;
  amount: number;
  methodLabel: string;
  reference?: string | null;
  /** Balance left after this receipt, or the balance now if it was voided. */
  balanceAfter: number;
  receivedByName?: string | null;
  bankDetails?: string | null;
  footer?: string | null;
  logoBytes?: Buffer | null;
  voided?: boolean;
  /**
   * Who undid the receipt, when and why (reaudit N14). A red "VOID" across a
   * printed slip proves the money is not real but explains nothing, so the
   * person holding the paper cannot tell a mistyped entry from a refund.
   */
  voidedOn?: Date | null;
  voidedByName?: string | null;
  voidReason?: string | null;
};

/**
 * The receipt carries the amount in figures *and* words, the way a paper payment
 * slip does, so a figure cannot quietly be altered after it is signed.
 */
export async function renderReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Receipt ${data.receiptNo}`);
  doc.setAuthor(data.instituteName);
  doc.setProducer("DarbarTech");

  const page = doc.addPage([A5.width, A5.height]);
  const regular = await loadFont(doc, "regular", StandardFonts.Helvetica);
  const semibold = await loadFont(doc, "semibold", StandardFonts.HelveticaBold);
  const bold = await loadFont(doc, "bold", StandardFonts.HelveticaBold);

  const rightLimit = A5.width - MARGIN;
  let y = A5.height - MARGIN;

  const text = (
    value: string,
    options: {
      size?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
      x?: number;
      align?: "left" | "right";
      maxWidth?: number;
    } = {}
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? 9.5;
    const color = options.color ?? INK;
    const width = font.widthOfTextAtSize(value, size);
    const x =
      options.align === "right"
        ? rightLimit - width
        : (options.x ?? MARGIN);
    page.drawText(value, { x, y, size, font, color });
    return { width, size };
  };

  const rule = (gap = 8) => {
    y -= gap;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: rightLimit, y },
      thickness: 0.7,
      color: RULE,
    });
    y -= 10;
  };

  /* ── header ── */
  if (data.logoBytes) {
    try {
      const image = data.logoBytes.length > 10 && data.logoBytes[0] === 0xff
        ? await doc.embedJpg(data.logoBytes)
        : await doc.embedPng(data.logoBytes);
      const height = 34;
      const scale = height / image.height;
      page.drawImage(image, { x: MARGIN, y: y - height + 12, width: image.width * scale, height });
    } catch {
      // A broken logo file must not stop a receipt from printing.
    }
  }

  text(data.instituteName, { font: bold, size: 14, color: BRAND, x: data.logoBytes ? 110 : MARGIN });
  y -= 16;
  if (data.instituteAddress) {
    text(data.instituteAddress, { size: 8.5, color: MUTED, x: data.logoBytes ? 110 : MARGIN });
    y -= 11;
  }

  text("FEE PAYMENT RECEIPT", { font: semibold, size: 11, color: INK, align: "right" });
  y -= 15;
  text(data.receiptNo, { size: 9.5, color: MUTED, align: "right" });
  y -= 13;

  rule(6);

  if (data.voided) {
    page.drawText("VOID", {
      x: A5.width / 2 - 58,
      y: y - 26,
      size: 34,
      font: bold,
      color: rgb(0.85, 0.25, 0.25),
      opacity: 0.22,
    });
  }

  /* ── meta ── */
  const line = (
    label: string,
    value: string,
    options: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> } = {}
  ) => {
    text(label, { size: options.size ?? 9, color: MUTED });
    text(value, {
      font: options.bold ? semibold : regular,
      size: options.size ?? 9,
      align: "right",
      color: options.color ?? INK,
    });
    y -= (options.size ?? 9) + 8;
  };

  const receivedOn = campusDay(data.receivedAt);

  line("Received on", receivedOn);
  line("Against invoice", data.invoiceNumber);
  line("Received from", `${data.studentName}  ·  ${data.studentCode}`);
  line("Course / batch", [data.courseTitle, data.batchName].filter(Boolean).join(" — ") || data.invoiceTitle);
  line("Payment method", data.methodLabel);
  if (data.reference) line("Reference", data.reference);

  if (data.voided) {
    // The stamp says the money is gone; these lines say who took it back
    // (reaudit N14). Kept to two wrapped reason lines so a long note cannot push
    // the signature block off the page.
    line("Voided on", data.voidedOn ? campusDay(data.voidedOn) : "—", {
      color: VOID_RED,
    });
    line("Voided by", data.voidedByName ?? "A staff member", { color: VOID_RED });
    if (data.voidReason) {
      const rows = splitToFit(
        `Reason: ${data.voidReason}`,
        regular,
        9,
        A5.width - MARGIN * 2
      ).slice(0, 2);
      for (const row of rows) {
        text(row, { size: 9, color: VOID_RED });
        y -= 17;
      }
    }
  }

  rule(10);

  /* ── amount ── */
  text("AMOUNT RECEIVED", { font: semibold, size: 9, color: MUTED });
  y -= 18;
  text(formatNPR(data.amount), { font: bold, size: 22, color: INK });
  y -= 15;

  const words = amountInWords(data.amount);
  const wordsFont = semibold;
  const wrap = splitToFit(words, wordsFont, 11, A5.width - MARGIN * 2);
  for (const row of wrap) {
    text(row, { font: wordsFont, size: 11, color: INK });
    y -= 14;
  }

  rule(10);

  /* ── balance ── */
  line(
    data.balanceAfter > 0 ? "Balance remaining" : "Status",
    data.balanceAfter > 0 ? formatNPR(data.balanceAfter) : "Fully paid",
    { bold: true, size: 10.5 }
  );

  y -= 18;
  page.drawText(`Received by: ${data.receivedByName ?? "DarbarTech"}`, {
    x: MARGIN,
    y,
    size: 9,
    font: regular,
    color: INK,
  });
  page.drawLine({
    start: { x: rightLimit - 130, y: y - 4 },
    end: { x: rightLimit, y: y - 4 },
    thickness: 0.7,
    color: RULE,
  });
  page.drawText("Authorised signatory", {
    x: rightLimit - 130,
    y: y - 16,
    size: 8,
    font: regular,
    color: MUTED,
  });

  /* ── footer ── */
  const footerTop = MARGIN + 58;
  let fy = footerTop;
  const footLines: string[] = [];
  if (data.bankDetails) footLines.push(...wrapLabelled("Bank", data.bankDetails));
  if (data.footer) footLines.push(data.footer);
  footLines.push(
    "This receipt is computer-generated and is valid against the payments ledger."
  );

  page.drawLine({
    start: { x: MARGIN, y: footerTop + 14 },
    end: { x: rightLimit, y: footerTop + 14 },
    thickness: 0.7,
    color: RULE,
  });

  for (const row of footLines.slice(0, 5)) {
    page.drawText(row, { x: MARGIN, y: fy, size: 8, font: regular, color: MUTED });
    fy -= 10;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function splitToFit(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return [value];
  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapLabelled(label: string, value: string): string[] {
  const rows = value
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);
  return rows.map((row, index) => (index === 0 ? `${label}: ${row}` : `          ${row}`));
}
