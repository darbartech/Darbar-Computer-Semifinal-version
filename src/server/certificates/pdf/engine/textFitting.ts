import type { TemplateField } from "./types";

const MM_TO_PT = 2.83465;

const FONT_WIDTH_FACTOR: Record<string, Record<string, number>> = {
  "CormorantGaramond-Bold": {
    normal: 0.46,
    bold: 0.46,
    "600": 0.46,
    "700": 0.46,
    "800": 0.46,
    "extra-bold": 0.46,
  },
  "Montserrat-Regular": {
    normal: 0.54,
  },
  "Montserrat-Medium": {
    "500": 0.55,
    normal: 0.55,
  },
  "Montserrat-SemiBold": {
    "600": 0.57,
    normal: 0.57,
    bold: 0.57,
  },
  "Montserrat-Bold": {
    bold: 0.59,
    "700": 0.59,
    normal: 0.59,
  },
  "Montserrat-ExtraBold": {
    "800": 0.61,
    "extra-bold": 0.61,
    bold: 0.61,
    normal: 0.61,
  },
  Helvetica: {
    normal: 0.6,
  },
  "Helvetica-Bold": {
    bold: 0.62,
    normal: 0.62,
  },
};

const DEFAULT_WIDTH = 0.6;

export const mmToPt = (mm: number): number => mm * MM_TO_PT;

const getWidthFactor = (fontName: string, weight: string | number = "normal"): number => {
  const fontFacts = FONT_WIDTH_FACTOR[fontName];
  if (!fontFacts) return DEFAULT_WIDTH;
  const wKey = weight as string;
  if (fontFacts[wKey] !== undefined) return fontFacts[wKey];
  if (fontFacts.normal !== undefined) return fontFacts.normal;
  return DEFAULT_WIDTH;
};

export const estimateCharWidth = (
  fontSize: number,
  weight: string | number = "normal",
  fontName?: string
): number => {
  const ratio = getWidthFactor(fontName || "Helvetica", weight);
  return fontSize * ratio;
};

export const estimateTextWidth = (
  text: string,
  fontSize: number,
  weight: string | number = "normal",
  letterSpacing: number = 0,
  fontName?: string
): number => {
  if (!text) return 0;
  const charWidth = estimateCharWidth(fontSize, weight, fontName);
  let width = 0;
  for (const char of text) {
    if (char === " ") {
      width += charWidth * 0.5;
    } else if ("iIl.,;:| ".includes(char)) {
      width += charWidth * 0.38;
    } else if ("mMWw".includes(char)) {
      width += charWidth * 1.28;
    } else if ("fjlrtIJ().!?" .includes(char)) {
      width += charWidth * 0.7;
    } else if ("abcdeghknopqsuvxyzABCDEGHKLNOPQRSTUVXYZ0123456789".includes(char)) {
      width += charWidth;
    } else {
      width += charWidth;
    }
  }
  if (letterSpacing !== 0 && text.length > 1) {
    const effectiveSpacing = (letterSpacing / 1000) * fontSize;
    width += effectiveSpacing * (text.length - 1);
  }
  return width;
};

export const wrapTextToWidth = (
  text: string,
  maxWidthPt: number,
  fontSize: number,
  weight: string | number = "normal",
  letterSpacing: number = 0,
  fontName?: string
): string[] => {
  if (!text) return [];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const lineWidth = estimateTextWidth(testLine, fontSize, weight, letterSpacing, fontName);
    if (lineWidth <= maxWidthPt) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      const wordWidth = estimateTextWidth(word, fontSize, weight, letterSpacing, fontName);
      if (wordWidth > maxWidthPt) {
        let remaining = word;
        while (remaining.length > 0) {
          let chunkLength = 1;
          while (
            chunkLength < remaining.length &&
            estimateTextWidth(remaining.slice(0, chunkLength + 1), fontSize, weight, letterSpacing, fontName) <= maxWidthPt
          ) {
            chunkLength++;
          }
          lines.push(remaining.slice(0, chunkLength));
          remaining = remaining.slice(chunkLength);
        }
        currentLine = "";
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
};

export const fitTextToField = (
  text: string,
  field: TemplateField
): {
  fontSize: number;
  lines: string[];
  fits: boolean;
  error?: string;
} => {
  if (field.fontSize === 0 || field.minFontSize === 0) {
    return {
      fontSize: 0,
      lines: text ? [text] : [],
      fits: true,
    };
  }

  const maxWidthPt = mmToPt(field.width);
  const maxLines = field.maxLines;
  const letterSpacing = field.letterSpacing || 0;
  const fontName = field.font || "Helvetica";

  let fontSize = field.fontSize;
  let lines: string[] = [];
  let fits = false;

  while (fontSize >= field.minFontSize) {
    lines = wrapTextToWidth(text, maxWidthPt, fontSize, field.weight, letterSpacing, fontName);

    // NOTE: field.height is the tight ink bounding box measured off the PSD
    // sample text, not a line-box budget (it isn't used to position the
    // drawn text either - see certificateRenderer.ts, which positions purely
    // from field.y and fontSize). Comparing lines*fontSize*lineHeight against
    // it produced false "overflow" rejections on every field. The only real
    // constraint is that the wrapped text stays within maxLines.
    if (lines.length <= maxLines) {
      fits = true;
      break;
    }

    fontSize -= 0.5;
  }

  if (!fits) {
    if (field.overflowPolicy === "shrink_then_reject" || field.overflowPolicy === "reject") {
      return {
        fontSize: field.minFontSize,
        lines,
        fits: false,
        error: `Text "${text.slice(0, 40)}${text.length > 40 ? "..." : ""}" does not fit in field "${field.field}". Maximum allowed: ${field.maxLines} lines at minimum ${field.minFontSize}pt.`,
      };
    }
    if (field.overflowPolicy === "wrap_then_shrink") {
      lines = lines.slice(0, maxLines);
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        const maxCharWidth = estimateCharWidth(field.minFontSize, field.weight, fontName);
        const maxChars = Math.floor(maxWidthPt / maxCharWidth) - 1;
        if (lastLine.length > maxChars && maxChars > 3) {
          lines[lines.length - 1] = lastLine.slice(0, maxChars - 3) + "...";
        }
      }
      return {
        fontSize: field.minFontSize,
        lines,
        fits: false,
        error: `Text "${text.slice(0, 40)}..." in field "${field.field}" was truncated.`,
      };
    }
  }

  return { fontSize, lines, fits: true };
};

export const getXOffsetForAlignment = (
  textWidthPt: number,
  fieldXmm: number,
  fieldWidthMm: number,
  alignment: "left" | "center" | "right"
): number => {
  const fieldXpt = mmToPt(fieldXmm);
  const fieldWidthPt = mmToPt(fieldWidthMm);
  switch (alignment) {
    case "center":
      return fieldXpt + (fieldWidthPt - textWidthPt) / 2;
    case "right":
      return fieldXpt + fieldWidthPt - textWidthPt;
    case "left":
    default:
      return fieldXpt;
  }
};

export const validateModuleLayout = (
  modules: { title: string; subtitle?: string }[],
  template: {
    moduleConstraints: {
      minCount: number;
      maxCount: number;
      maxTitleLength: number;
      maxSubtitleLength: number;
      area: { height: number; gap: number };
      item: { titleSize: number; subtitleSize: number };
    };
  }
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const { minCount, maxCount, maxTitleLength, maxSubtitleLength, area, item } = template.moduleConstraints;

  if (modules.length < minCount) {
    errors.push(`At least ${minCount} modules are required.`);
  }
  if (modules.length > maxCount) {
    errors.push(`At most ${maxCount} modules are allowed.`);
  }

  modules.forEach((mod, idx) => {
    if (!mod.title || mod.title.trim().length === 0) {
      errors.push(`Module ${idx + 1}: title is required.`);
    } else if (mod.title.length > maxTitleLength) {
      errors.push(`Module ${idx + 1}: title exceeds ${maxTitleLength} characters.`);
    }
    if (mod.subtitle && mod.subtitle.length > maxSubtitleLength) {
      errors.push(`Module ${idx + 1}: subtitle exceeds ${maxSubtitleLength} characters.`);
    }
  });

  const moduleCount = modules.length;
  const gapMm = area.gap;
  const titleHeightPt = item.titleSize * 1.2;
  const subtitleHeightPt = item.subtitleSize * 1.2;
  const perModuleHeightPt = titleHeightPt + subtitleHeightPt + mmToPt(gapMm);
  const totalRequiredPt = perModuleHeightPt * moduleCount;
  const availablePt = mmToPt(area.height);

  if (totalRequiredPt > availablePt) {
    errors.push(`Module layout exceeds available vertical space. Reduce module count or shorten content.`);
  }

  return { valid: errors.length === 0, errors };
};
