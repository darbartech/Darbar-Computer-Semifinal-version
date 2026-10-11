/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars, prefer-const */
// Verbatim port of the reference project's pdf-lib certificate renderer. The reference
// lints with `next/core-web-vitals` only, so it carries `any` types and lazy `require()`
// calls that Darbar's stricter config rejects. Output parity with the reference is proven
// by a byte-for-byte comparison of the generated content stream, so this file must stay
// unedited apart from import paths and the fonts directory.
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  grayscale,
  degrees,
} from "pdf-lib";
import type { PDFImage } from "pdf-lib";
import type {
  CertificateRenderInput,
  RenderResult,
  TemplateConfig,
  TemplateField,
  CertificateModule,
} from "./types";
import {
  mmToPt,
  fitTextToField,
  getXOffsetForAlignment,
  estimateTextWidth,
  wrapTextToWidth,
  validateModuleLayout,
} from "./textFitting";
import { generateQrCodeDataUrl } from "./qrGenerator";
import { formatCertificateDate } from "./dateFormatter";
import { DARBARTECH_CERTIFICATE_TEMPLATE } from "./templates/darbartech-certificate-v1";

const hexToRgb = (hex: string) => {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return rgb(r, g, b);
};

const drawTrackedText = (
  page: any,
  text: string,
  opts: { x: number; y: number; size: number; font: any; color: any },
  letterSpacingPt: number
) => {
  if (letterSpacingPt === 0) return page.drawText(text, opts);
  let cursor = opts.x;
  for (const ch of text) {
    page.drawText(ch, { ...opts, x: cursor });
    cursor += opts.font.widthOfTextAtSize(ch, opts.size) + letterSpacingPt;
  }
};

const measureTracked = (t: string, font: any, size: number, lsPt: number) =>
  font.widthOfTextAtSize(t, size) + lsPt * Math.max(t.length - 1, 0);

const ISSUER_NAME_FALLBACK = "DarbarTech Group of Technology";

const getFontForTemplate = (doc: PDFDocument, fontName: string) => {
  const fontMap: Record<string, StandardFonts> = {
    "Helvetica": StandardFonts.Helvetica,
    "Helvetica-Bold": StandardFonts.HelveticaBold,
    "Helvetica-Oblique": StandardFonts.HelveticaOblique,
    "Helvetica-BoldOblique": StandardFonts.HelveticaBoldOblique,
    "Times-Roman": StandardFonts.TimesRoman,
    "Times-Bold": StandardFonts.TimesRomanBold,
    "Times-Italic": StandardFonts.TimesRomanItalic,
    "Courier": StandardFonts.Courier,
    "Courier-Bold": StandardFonts.CourierBold,
  };
  return doc.embedFont(fontMap[fontName] || StandardFonts.Helvetica);
};

const loadCustomFonts = async (
  doc: PDFDocument
): Promise<{ fonts: Record<string, any>; missing: string[] }> => {
  const fs = require("fs");
  const path = require("path");
  // Port deviation (path only, output-neutral): the reference project resolves fonts
  // from `<root>/assets/fonts`. Darbar keeps the same six byte-identical TTFs under
  // `src/server/certificates/pdf/fonts/files`, so only the directory differs.
  const fontsDir = path.resolve(
    process.cwd(),
    "src/server/certificates/pdf/fonts/files"
  );

  const fontFiles: Record<string, string> = {
    "Montserrat-Regular": "Montserrat-Regular.ttf",
    "Montserrat-Medium": "Montserrat-Medium.ttf",
    "Montserrat-SemiBold": "Montserrat-SemiBold.ttf",
    "Montserrat-Bold": "Montserrat-Bold.ttf",
    "Montserrat-ExtraBold": "Montserrat-ExtraBold.ttf",
    "CormorantGaramond-Bold": "CormorantGaramond-Bold.ttf",
  };

  const fallbackMap: Record<string, StandardFonts> = {
    "Montserrat-Regular": StandardFonts.Helvetica,
    "Montserrat-Medium": StandardFonts.Helvetica,
    "Montserrat-SemiBold": StandardFonts.HelveticaBold,
    "Montserrat-Bold": StandardFonts.HelveticaBold,
    "Montserrat-ExtraBold": StandardFonts.HelveticaBold,
    "CormorantGaramond-Bold": StandardFonts.HelveticaBold,
  };

  const fonts: Record<string, any> = {};
  const missing: string[] = [];
  for (const [key, filename] of Object.entries(fontFiles)) {
    try {
      const fontPath = path.resolve(fontsDir, filename);
      if (fs.existsSync(fontPath)) {
        const bytes = fs.readFileSync(fontPath);
        fonts[key] = await doc.embedFont(bytes, { subset: false });
      } else {
        missing.push(key);
        fonts[key] = await doc.embedFont(fallbackMap[key]);
      }
    } catch {
      missing.push(key);
      fonts[key] = await doc.embedFont(fallbackMap[key]);
    }
  }
  return { fonts, missing };
};

type PngAlphaBounds = {
  image: PDFImage;
  visibleX: number;
  visibleY: number;
  visibleW: number;
  visibleH: number;
  bitmapW: number;
  bitmapH: number;
};

const loadPngWithAlphaBounds = async (
  doc: PDFDocument,
  imagePath?: string
): Promise<PngAlphaBounds | null> => {
  if (!imagePath) return null;
  try {
    const fs = require("fs");
    const path = require("path");
    const sharp = require("sharp");
    const resolvedPath = path.resolve(process.cwd(), "public", imagePath.replace(/^\//, ""));
    if (!fs.existsSync(resolvedPath)) return null;
    const bytes = fs.readFileSync(resolvedPath);
    if (!imagePath.endsWith(".png")) return null;

    const metadata: any = await sharp(bytes).metadata();
    const w = metadata.width as number;
    const h = metadata.height as number;

    const alphaBuf: Buffer = await sharp(bytes)
      .ensureAlpha()
      .extractChannel(3)
      .raw()
      .toBuffer();

    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = alphaBuf[y * w + x];
        if (a > 1) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0 || maxY < 0) return null;
    const image: PDFImage = await doc.embedPng(bytes);
    return {
      image,
      visibleX: minX,
      visibleY: minY,
      visibleW: maxX - minX + 1,
      visibleH: maxY - minY + 1,
      bitmapW: w,
      bitmapH: h,
    };
  } catch {
    return null;
  }
};

const loadImageIfExists = async (doc: PDFDocument, imagePath?: string): Promise<PDFImage | null> => {
  if (!imagePath) return null;
  try {
    const fs = require("fs");
    const path = require("path");
    const resolvedPath = path.resolve(process.cwd(), "public", imagePath.replace(/^\//, ""));
    if (fs.existsSync(resolvedPath)) {
      const bytes = fs.readFileSync(resolvedPath);
      if (imagePath.endsWith(".png")) {
        return await doc.embedPng(bytes);
      } else if (imagePath.endsWith(".jpg") || imagePath.endsWith(".jpeg")) {
        return await doc.embedJpg(bytes);
      }
    }
  } catch {}
  return null;
};

const renderTextInField = (
  page: any,
  field: TemplateField,
  text: string,
  fonts: Record<string, any>,
  errors: string[],
  warnings?: string[]
): void => {
  const pageHeight = page.getHeight();
  const letterSpacing = field.letterSpacing || 0;
  const lineHeightRatio = field.lineHeight || 1.2;

  if (field.runs && field.runs.length > 0) {
    const runs = field.runs;
    const largestFontSize = runs.reduce((max: number, r: any) => Math.max(max, r.fontSize || 0), 0);
    const pageWidthPt = mmToPt(field.width);

    const lsForSize = (sf: number): number => {
      const sfSize = largestFontSize * sf;
      return letterSpacing === 0 ? 0 : (letterSpacing / 1000) * sfSize;
    };

    let scaleFactor = 1.0;
    const evaluateFit = (sf: number): { fits: boolean; totalWidth: number; metrics: any[] } => {
      let totalW = 0;
      const mets: any[] = [];
      const effectiveLs = lsForSize(sf);
      for (const run of runs) {
        const runFont = fonts[run.font] || fonts["Helvetica"];
        const runSize = (run.fontSize || largestFontSize) * sf;
        let runText = run.text || "";
        if (field.transformUppercase) {
          runText = runText.toUpperCase();
        }
        if (!runText) {
          mets.push(null);
          continue;
        }
        const totalRunWidth = measureTracked(runText, runFont, runSize, effectiveLs);
        totalW += totalRunWidth;
        mets.push({ text: runText, width: totalRunWidth, fontSize: runSize, font: runFont });
      }
      return { fits: totalW <= pageWidthPt, totalWidth: totalW, metrics: mets };
    };

    const combinedText = runs.map((r: any) => r.text || "").join("");
    if (!combinedText && field.required) {
      errors.push(`Required field "${field.field}" has no content.`);
      return;
    }
    if (!combinedText && !field.required) return;

    let eval1 = evaluateFit(1.0);
    if (!eval1.fits) {
      let lo = 0.1;
      let hi = 1.0;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const evalM = evaluateFit(mid);
        if (evalM.fits) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      scaleFactor = lo;
    }

    const smallestScaledSize = runs.reduce((m: number, r: any) => Math.min(m, (r.fontSize || largestFontSize) * scaleFactor), Infinity);
    const minSizeThreshold = (field.minFontSize || (largestFontSize * 0.6));
    if (smallestScaledSize < minSizeThreshold) {
      warnings?.push(`Text "${combinedText.slice(0, 40)}${combinedText.length > 40 ? "..." : ""}" does not fit in field "${field.field}". Maximum allowed: ${field.maxLines} lines at minimum ${minSizeThreshold}pt.`);
    }

    let finalEval = scaleFactor === 1.0 ? eval1 : evaluateFit(scaleFactor);
    const scaledFontSize = largestFontSize * scaleFactor;
    const finalLs = lsForSize(scaleFactor);

    const runColorDefault = field.color ? hexToRgb(field.color) : grayscale(0);
    let totalBlockWidth = 0;
    const runMetrics: { width: number; text: string; font: any; fontSize: number; color: any }[] = [];
    runs.forEach((run: any, idx: number) => {
      const metric = finalEval.metrics[idx];
      if (!metric) return;
      const runColor = run.color ? hexToRgb(run.color) : runColorDefault;
      totalBlockWidth += metric.width;
      runMetrics.push({
        width: metric.width,
        text: metric.text,
        font: metric.font,
        fontSize: metric.fontSize,
        color: runColor,
      });
    });

    const initialX = getXOffsetForAlignment(totalBlockWidth, field.x, field.width, field.alignment);
    const yPt = pageHeight - mmToPt(field.y) - mmToPt(field.height) * scaleFactor;

    let cursorX = initialX;
    for (const metric of runMetrics) {
      drawTrackedText(page, metric.text, {
        x: cursorX,
        y: yPt,
        size: metric.fontSize,
        font: metric.font,
        color: metric.color,
      }, finalLs);
      cursorX += metric.width;
    }

    return;
  }

  if (field.fontSize === 0 || field.minFontSize === 0) return;

  if (!text && field.required) {
    errors.push(`Required field "${field.field}" has no content.`);
    return;
  }
  if (!text && !field.required) return;

  const fontKey = field.font || "Helvetica";
  const font = fonts[fontKey] || fonts["Helvetica"];
  const color = field.color ? hexToRgb(field.color) : grayscale(0);
  const maxWidthPt = mmToPt(field.width);
  const maxLines = field.maxLines;
  const displayText = field.transformUppercase ? text.toUpperCase() : text;

  let fontSize = field.fontSize;
  let finalLines: string[] = [];
  let fits = false;

  while (fontSize >= field.minFontSize) {
    const effectiveLs = letterSpacing === 0 ? 0 : (letterSpacing / 1000) * fontSize;
    const words = displayText.split(/\s+/);
    const candidate: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      const width = measureTracked(test, font, fontSize, effectiveLs);
      if (width <= maxWidthPt) {
        current = test;
      } else {
        if (current) candidate.push(current);
        const ww = measureTracked(word, font, fontSize, effectiveLs);
        if (ww > maxWidthPt) {
          let remaining = word;
          while (remaining.length > 0) {
            let chunk = 1;
            while (
              chunk < remaining.length &&
              measureTracked(remaining.slice(0, chunk + 1), font, fontSize, effectiveLs) <= maxWidthPt
            ) {
              chunk++;
            }
            candidate.push(remaining.slice(0, chunk));
            remaining = remaining.slice(chunk);
          }
          current = "";
        } else {
          current = word;
        }
      }
    }
    if (current) candidate.push(current);
    if (candidate.length <= maxLines) {
      finalLines = candidate;
      fits = true;
      break;
    }
    fontSize -= 0.5;
  }

  if (!fits) {
    const shrinkFrom = field.overflowPolicy === "wrap_then_shrink" ? "wrap_then_shrink" : "reject";
    if (shrinkFrom === "wrap_then_shrink") {
      finalLines = (finalLines.length ? finalLines : [displayText]).slice(0, maxLines);
    } else {
      warnings?.push(`Text "${displayText.slice(0, 40)}${displayText.length > 40 ? "..." : ""}" does not fit in field "${field.field}". Maximum allowed: ${field.maxLines} lines at minimum ${field.minFontSize}pt.`);
      fontSize = field.minFontSize;
      finalLines = [displayText];
    }
  }

  const effectiveLetterSpacingFinal = letterSpacing === 0 ? 0 : (letterSpacing / 1000) * fontSize;
  const fontSizeRatio = field.fontSize > 0 ? fontSize / field.fontSize : 1;
  const capHeightMm = (field as any).capHeightMm ?? field.height / Math.max(field.maxLines, 1);
  const baselineOffset = mmToPt(capHeightMm) * fontSizeRatio;
  finalLines.forEach((line, lineIdx) => {
    const lineWidth = measureTracked(line, font, fontSize, effectiveLetterSpacingFinal);
    const x = getXOffsetForAlignment(lineWidth, field.x, field.width, field.alignment);
    const yPt = pageHeight - mmToPt(field.y) - baselineOffset - lineIdx * fontSize * lineHeightRatio;
    drawTrackedText(page, line, {
      x,
      y: yPt,
      size: fontSize,
      font,
      color,
    }, effectiveLetterSpacingFinal);
  });
};

const drawPageBorder = (page: any, template: TemplateConfig, colors: TemplateConfig["colors"]): void => {
  const width = page.getWidth();
  const height = page.getHeight();
  const borderInset = mmToPt(4);
  const innerInset = mmToPt(5);
  const navyColor = hexToRgb(colors.brandNavy?.hex || "#0a2463");
  const goldColor = hexToRgb(colors.brandGold?.hex || "#c9a227");

  page.drawRectangle({
    x: borderInset,
    y: borderInset,
    width: width - borderInset * 2,
    height: height - borderInset * 2,
    borderColor: navyColor,
    borderWidth: 1.5,
  });

  page.drawRectangle({
    x: innerInset,
    y: innerInset,
    width: width - innerInset * 2,
    height: height - innerInset * 2,
    borderColor: goldColor,
    borderWidth: 0.8,
  });

  const cornerSize = mmToPt(12);
  const cornerColor = hexToRgb(colors.brandNavy?.hex || "#0a2463");

  const drawCorner = (cx: number, cy: number, tl: boolean, tr: boolean, bl: boolean, br: boolean) => {
    const lineWidth = 2;
    if (tl) {
      page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + cornerSize, y: cy }, color: cornerColor, thickness: lineWidth });
      page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy + cornerSize }, color: cornerColor, thickness: lineWidth });
    }
    if (tr) {
      page.drawLine({ start: { x: cx, y: cy }, end: { x: cx - cornerSize, y: cy }, color: cornerColor, thickness: lineWidth });
      page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy + cornerSize }, color: cornerColor, thickness: lineWidth });
    }
    if (bl) {
      page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + cornerSize, y: cy }, color: cornerColor, thickness: lineWidth });
      page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy - cornerSize }, color: cornerColor, thickness: lineWidth });
    }
    if (br) {
      page.drawLine({ start: { x: cx, y: cy }, end: { x: cx - cornerSize, y: cy }, color: cornerColor, thickness: lineWidth });
      page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy - cornerSize }, color: cornerColor, thickness: lineWidth });
    }
  };

  const margin = mmToPt(8);
  drawCorner(margin, margin, false, false, true, false);
  drawCorner(width - margin, margin, false, false, false, true);
  drawCorner(margin, height - margin, true, false, false, false);
  drawCorner(width - margin, height - margin, false, true, false, false);
};

const renderModules = (
  page: any,
  modules: CertificateModule[],
  template: TemplateConfig,
  fonts: Record<string, any>,
  errors: string[],
  warnings?: string[]
): void => {
  const layoutValidation = validateModuleLayout(modules, template);
  if (!layoutValidation.valid) {
    warnings?.push(...layoutValidation.errors);
  }

  const { area, item } = template.moduleConstraints;
  const sortedModules = [...modules].sort((a, b) => a.order - b.order);
  const pageHeight = page.getHeight();
  const count = sortedModules.length;

  const titleFont = fonts[item.titleFont] || fonts["Helvetica-Bold"];
  const subtitleFont = fonts[item.subtitleFont] || fonts["Helvetica"];
  const titleColor = hexToRgb(item.titleColor);
  const subtitleColor = hexToRgb(item.subtitleColor);

  const titleLineHeight = item.titleSize * 1.2;
  const subtitleLineHeight = item.subtitleSize * 1.3;
  const perModuleHeight = titleLineHeight + subtitleLineHeight + mmToPt(area.gap);
  const totalHeight = perModuleHeight * count;
  const startY = area.y + (count > 0 ? (area.height * count) / count : 0) * 0;

  const availableAreaY = area.y;
  const availableAreaHeight = area.height;
  const moduleAreaStartPt = pageHeight - mmToPt(availableAreaY + availableAreaHeight) + mmToPt(2);
  const spacing = count > 1 ? (mmToPt(availableAreaHeight) - totalHeight) / (count - 1) : 0;

  sortedModules.forEach((mod, idx) => {
    const baseY = moduleAreaStartPt + mmToPt(availableAreaHeight) - (idx + 1) * (perModuleHeight + (count > 1 ? spacing - mmToPt(area.gap) : 0));
    const moduleX = mmToPt(area.x);
    const moduleWidthPt = mmToPt(area.width);

    const maxTitleWidth = moduleWidthPt;
    let titleLines = wrapTextToWidth(mod.title, maxTitleWidth, item.titleSize, item.titleWeight);
    titleLines = titleLines.slice(0, 1);
    titleLines.forEach((line, tIdx) => {
      const lineW = titleFont.widthOfTextAtSize(line, item.titleSize);
      const x = getXOffsetForAlignment(lineW, area.x, area.width, item.alignment);
      const y = baseY + subtitleLineHeight + titleLineHeight - (tIdx + 1) * item.titleSize * 1.2;
      drawTrackedText(page, line, {
        x,
        y,
        size: item.titleSize,
        font: titleFont,
        color: titleColor,
      }, 0);
    });

    if (mod.subtitle) {
      const subtitleLines = wrapTextToWidth(mod.subtitle, maxTitleWidth, item.subtitleSize, item.subtitleWeight);
      subtitleLines.slice(0, 2).forEach((line, sIdx) => {
        const lineW = subtitleFont.widthOfTextAtSize(line, item.subtitleSize);
        const x = getXOffsetForAlignment(lineW, area.x, area.width, item.alignment);
        const y = baseY + subtitleLineHeight - (sIdx + 1) * item.subtitleSize * 1.3;
        drawTrackedText(page, line, {
          x,
          y,
          size: item.subtitleSize,
          font: subtitleFont,
          color: subtitleColor,
        }, 0);
      });
    }

    const bulletX = moduleX - mmToPt(3);
    const bulletY = baseY + subtitleLineHeight + titleLineHeight - item.titleSize * 0.6;
    const bulletSize = 2.5;
    const goldColor = hexToRgb(template.colors.brandGold?.hex || "#c9a227");
    page.drawCircle({
      x: bulletX + bulletSize / 2,
      y: bulletY + bulletSize / 2,
      size: bulletSize,
      color: goldColor,
    });
  });
};

const drawShapes = (page: any, shapes: any[] | undefined): void => {
  if (!shapes || shapes.length === 0) return;
  const pageHeight = page.getHeight();

  for (const shape of shapes) {
    const strokeColor = shape.stroke ? hexToRgb(shape.stroke) : undefined;
    const fillColor = shape.fill ? hexToRgb(shape.fill) : undefined;
    const borderWidth = shape.strokeWidthMm ? mmToPt(shape.strokeWidthMm) : 0;
    const hasRotation = typeof shape.rotationDeg === "number" && shape.rotationDeg !== 0;

    if (shape.kind === "polygon") {
      const rawPoints: Array<{ x: number; y: number }> = shape.points || [];
      if (rawPoints.length < 3) continue;

      const parts = rawPoints.map(
        (pt, idx) => `${idx === 0 ? "M" : "L"} ${mmToPt(pt.x)} ${mmToPt(pt.y)}`
      );
      parts.push("Z");

      const svgOpts: any = { x: 0, y: pageHeight };
      if (fillColor) svgOpts.color = fillColor;
      if (strokeColor) {
        svgOpts.borderColor = strokeColor;
        svgOpts.borderWidth = Math.max(borderWidth, 0.5);
      }
      if (hasRotation) svgOpts.rotate = degrees(shape.rotationDeg);
      page.drawSvgPath(parts.join(" "), svgOpts);
      continue;
    }

    const xPt = mmToPt(shape.x);
    const yPtBottom = pageHeight - mmToPt(shape.y) - mmToPt(shape.height);
    const wPt = mmToPt(shape.width);
    const hPt = mmToPt(shape.height);

    if (shape.kind === "rect") {
      const opts: any = { x: xPt, y: yPtBottom, width: wPt, height: hPt, borderWidth };
      if (hasRotation) opts.rotate = degrees(shape.rotationDeg);
      if (strokeColor) opts.borderColor = strokeColor;
      if (fillColor) opts.color = fillColor;
      if (shape.cornerRadiusMm && shape.cornerRadiusMm > 0) {
        // pdf-lib's drawRectangle has no corner-radius support — options like
        // borderTopLeftRadius are silently ignored. Draw a true rounded-rect
        // pill via an SVG path instead (parity spec §8 requires semicircular
        // caps: r = height / 2).
        const rPt = Math.min(mmToPt(shape.cornerRadiusMm), wPt / 2, hPt / 2);
        const x0 = xPt;
        const y0 = mmToPt(shape.y); // top-origin (drawSvgPath uses a y-flipped space)
        const parts = [
          `M ${x0 + rPt} ${y0}`,
          `L ${x0 + wPt - rPt} ${y0}`,
          `A ${rPt} ${rPt} 0 0 1 ${x0 + wPt} ${y0 + rPt}`,
          `L ${x0 + wPt} ${y0 + hPt - rPt}`,
          `A ${rPt} ${rPt} 0 0 1 ${x0 + wPt - rPt} ${y0 + hPt}`,
          `L ${x0 + rPt} ${y0 + hPt}`,
          `A ${rPt} ${rPt} 0 0 1 ${x0} ${y0 + hPt - rPt}`,
          `L ${x0} ${y0 + rPt}`,
          `A ${rPt} ${rPt} 0 0 1 ${x0 + rPt} ${y0}`,
          "Z",
        ].join(" ");
        const svgOpts: any = { x: 0, y: pageHeight };
        if (fillColor) svgOpts.color = fillColor;
        if (strokeColor) {
          svgOpts.borderColor = strokeColor;
          svgOpts.borderWidth = borderWidth;
        }
        if (hasRotation) svgOpts.rotate = degrees(shape.rotationDeg);
        page.drawSvgPath(parts, svgOpts);
      } else {
        page.drawRectangle(opts);
      }

    } else if (shape.kind === "triangle") {
      const svgPath = `M 0 0 L ${wPt} 0 L 0 ${hPt} Z`;
      const svgOpts: any = { x: xPt, y: pageHeight - mmToPt(shape.y) };
      if (strokeColor) {
        svgOpts.borderColor = strokeColor;
        svgOpts.borderWidth = Math.max(borderWidth, 0.5);
      }
      if (fillColor) svgOpts.color = fillColor;
      if (hasRotation) svgOpts.rotate = degrees(shape.rotationDeg);
      page.drawSvgPath(svgPath, svgOpts);

    } else if (shape.kind === "line") {
      const horizontal = shape.orientation
        ? shape.orientation === "horizontal"
        : shape.width >= shape.height;

      const start = { x: xPt, y: pageHeight - mmToPt(shape.y) };
      const end = horizontal
        ? { x: xPt + wPt, y: start.y }
        : { x: xPt, y: pageHeight - mmToPt(shape.y + shape.height) };

      const lineOpts: any = {
        start,
        end,
        thickness: borderWidth > 0 ? borderWidth : 0.5,
      };
      if (strokeColor) lineOpts.color = strokeColor;
      page.drawLine(lineOpts);
    }
  }
};

export const renderCertificatePdf = async (
  input: CertificateRenderInput,
  template: TemplateConfig = DARBARTECH_CERTIFICATE_TEMPLATE
): Promise<RenderResult> => {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const pageWidth = mmToPt(template.page.width);
    const pageHeight = mmToPt(template.page.height);

    const page = doc.addPage([pageWidth, pageHeight]);
    page.setSize(pageWidth, pageHeight);

    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(1, 1, 1),
    });

    const isV2 = template.version && template.version.startsWith("2.");

    // Rendering order follows FR-11:
    //   1. White page background (done above via drawRectangle)
    //   2. Watermark
    //   3. Frame + corner shapes  (handled by grouped drawShapes in Task 5)
    //   4. Footer shapes
    //   5. QR separator line
    //   6. Logo
    //   7. QR image
    //   8. Static labels
    //   9. Dynamic text
    //  10. Module content
    //  11. Grade badge rect + grade text
    //  12. Signatories
    //  13. Footer text
    // Watermark goes BEFORE any frame / shape / content so it always sits behind everything.
    const watermarkAlpha = isV2 ? await loadPngWithAlphaBounds(doc, template.staticAssets.watermarkLogo) : null;
    if (watermarkAlpha && isV2) {
      const wmX = mmToPt(228.9);
      const wmW = mmToPt(70.7);
      const wmH = mmToPt(55.2);
      const wmVisibleAspect = watermarkAlpha.visibleW / watermarkAlpha.visibleH;
      const bitmapAspect = watermarkAlpha.bitmapW / watermarkAlpha.bitmapH;

      let wmDrawVisibleW = wmW;
      let wmDrawVisibleH = wmW / wmVisibleAspect;
      if (wmDrawVisibleH > wmH) {
        wmDrawVisibleH = wmH;
        wmDrawVisibleW = wmH * wmVisibleAspect;
      }
      const wmScaleForBitmap = wmDrawVisibleW / watermarkAlpha.visibleW;
      const wmDrawBitmapW = watermarkAlpha.bitmapW * wmScaleForBitmap;
      const wmDrawBitmapH = watermarkAlpha.bitmapH * wmScaleForBitmap;

      const visibleInsetLeftPt = watermarkAlpha.visibleX * wmScaleForBitmap;
      const visibleInsetTopPt = watermarkAlpha.visibleY * wmScaleForBitmap;

      const wmCenteredVisibleX = wmX + (wmW - wmDrawVisibleW) / 2;
      const wmDrawBitmapX = wmCenteredVisibleX - visibleInsetLeftPt;
      const wmDrawBitmapTopY = pageHeight - mmToPt(53.5) - wmDrawVisibleH - visibleInsetTopPt;

      page.drawImage(watermarkAlpha.image, {
        x: wmDrawBitmapX,
        y: wmDrawBitmapTopY,
        width: wmDrawBitmapW,
        height: wmDrawBitmapH,
        opacity: 0.08,
      } as any);
    }

    const helvetica = await getFontForTemplate(doc, "Helvetica");
    const helveticaBold = await getFontForTemplate(doc, "Helvetica-Bold");
    const helveticaOblique = await getFontForTemplate(doc, "Helvetica-Oblique");
    const helveticaBoldOblique = await getFontForTemplate(doc, "Helvetica-BoldOblique");
    const { fonts: embeddedCustomFonts, missing: missingCustomFonts } = await loadCustomFonts(doc);

    if (isV2 && missingCustomFonts.length > 0) {
      for (const f of missingCustomFonts) {
        errors.push(
          `Required v2 font asset missing: ${f}. Refusing to silently fall back to Helvetica.`
        );
      }
    }

    const fonts: Record<string, any> = {
      "Helvetica": helvetica,
      "Helvetica-Bold": helveticaBold,
      "Helvetica-Oblique": helveticaOblique,
      "Helvetica-BoldOblique": helveticaBoldOblique,
      ...embeddedCustomFonts,
    };

    if (template.shapes) {
      drawShapes(page, template.shapes);
    }

    if (!template.shapes || template.shapes.length === 0) {
      drawPageBorder(page, template, template.colors);
    }

    const logoAlpha = isV2
      ? await loadPngWithAlphaBounds(doc, template.staticAssets.logo)
      : null;
    const logoFallbackImage = !isV2 ? await loadImageIfExists(doc, template.staticAssets.logo) : null;
    if (logoAlpha && isV2) {
      const logoField = template.fields.issuerLogo;
      if (logoField) {
        const fieldW = mmToPt(logoField.width);
        const fieldH = mmToPt(logoField.height);
        const fieldLeft = mmToPt(logoField.x);
        const fieldTopYmm = logoField.y;

        const visibleAspect = logoAlpha.visibleW / logoAlpha.visibleH;
        let drawVisibleW = fieldW;
        let drawVisibleH = fieldW / visibleAspect;
        if (drawVisibleH > fieldH) {
          drawVisibleH = fieldH;
          drawVisibleW = fieldH * visibleAspect;
        }
        const scale = drawVisibleW / logoAlpha.visibleW;
        const drawBitmapW = logoAlpha.bitmapW * scale;
        const drawBitmapH = logoAlpha.bitmapH * scale;
        const insetLeftPt = logoAlpha.visibleX * scale;
        const insetTopPt = logoAlpha.visibleY * scale;
        const visibleCenteredX = fieldLeft + (fieldW - drawVisibleW) / 2;
        const drawX = visibleCenteredX - insetLeftPt;
        // pdf-lib drawImage y = bottom of image. The field's y is top-of-field in mm.
        // fieldTopInPtFromBottom = pageHeight - mmToPt(fieldTopYmm)  => top edge from bottom origin
        // visible rect's top from bottom: pageHeight - mmToPt(fieldTopYmm) - 0 + 0 mm between
        //   ... actually we want visible rect's TOP edge to sit at y=fieldTopYmm (top of field)
        //   but we're drawing the bitmap, not the visible rect.
        //   Compute TOP of bitmap in page coordinates (from top of page):
        //     bitmapTop = fieldTop - (visibleY / visibleH) * drawVisibleH
        //   easier: visible TOP sits at fieldTopYmm (mm from top of page).
        //   bitmap is shifted UP from visible top by (visibleY px * scale).
        //   So: bitmapTopMm = fieldTopYmm - (insetTopPtFromAbove / mmToPt(1))
        //   Converting to pdf-lib bottom origin:
        //     drawY (bottom-of-bitmap) = pageHeight - (bitmapTopMm * mmToPt(1)) - drawBitmapH
        const bitmapTopFromTopOfPagePt = mmToPt(fieldTopYmm) - insetTopPt;
        const drawY = pageHeight - bitmapTopFromTopOfPagePt - drawBitmapH;
        page.drawImage(logoAlpha.image, {
          x: drawX,
          y: drawY,
          width: drawBitmapW,
          height: drawBitmapH,
        });
      }
    } else if (logoFallbackImage && !isV2) {
      const logoField = template.fields.issuerLogo;
      if (logoField) {
        const logoW = mmToPt(logoField.width);
        const logoH = mmToPt(logoField.height);
        const aspectRatio = logoFallbackImage.width / logoFallbackImage.height;
        let drawW = logoW;
        let drawH = logoW / aspectRatio;
        if (drawH > logoH) {
          drawH = logoH;
          drawW = logoH * aspectRatio;
        }
        const logoX = mmToPt(logoField.x) + (mmToPt(logoField.width) - drawW) / 2;
        const logoY = pageHeight - mmToPt(logoField.y) - drawH;
        page.drawImage(logoFallbackImage, {
          x: logoX,
          y: logoY,
          width: drawW,
          height: drawH,
        });
      }
    } else if (!logoAlpha && !logoFallbackImage) {
      const brandNavy = hexToRgb(template.colors.brandNavy?.hex || "#0a2463");
      const logoX = mmToPt(19);
      const logoY = pageHeight - mmToPt(14 + 28);
      page.drawRectangle({
        x: logoX,
        y: logoY,
        width: mmToPt(28),
        height: mmToPt(28),
        borderColor: brandNavy,
        borderWidth: 1.5,
        color: rgb(0.97, 0.97, 0.98),
      });
      const logoText = "D";
      const logoTextFontSize = 22;
      const textW = helveticaBold.widthOfTextAtSize(logoText, logoTextFontSize);
      page.drawText(logoText, {
        x: logoX + (mmToPt(28) - textW) / 2,
        y: logoY + (mmToPt(28) - logoTextFontSize) / 2,
        size: logoTextFontSize,
        font: helveticaBold,
        color: brandNavy,
      });
    }
    if (isV2) {
      renderTextInField(page, template.fields.salutation as any, "This is to certify that", fonts, errors, warnings);

      const heroFieldWithText = {
        ...template.fields.heroHeadline,
        runs: [
          { ...(template.fields.heroHeadline as any).runs![0], text: "Certificate of" },
          { ...(template.fields.heroHeadline as any).runs![1], text: " completion" },
        ]
      };
      renderTextInField(page, heroFieldWithText, "", fonts, errors, warnings);

      renderTextInField(page, template.fields.recipientName as any, input.recipient.name, fonts, errors, warnings);

      // §11 — Dynamic name underlines (rules flanking the diamond)
      // BUG-13 (Round 5): the reference's rule is SHORTER than the name ink (span ÷ name
      // width = 0.88), not longer by a fixed padding. An earlier round's `+12mm` additive
      // formula was internally consistent but never checked against a same-text reference
      // case — for "AAYARA SHRESTHA" it produced a 173mm span vs. the reference's 142mm.
      // Formula per Round 5: ruleSpan = clamp(nameInkWidth * 0.88, minRuleSpanMm, maxRuleSpanMm)
      // Rules stop 3.4 mm from the text centre on each side, leaving a gap for the diamond.
      {
        const nameField = template.fields.recipientName as any;
        const nameText = nameField.transformUppercase
          ? input.recipient.name.toUpperCase()
          : input.recipient.name;
        const nameFontKey = nameField.font || "Helvetica";
        const nameFont = fonts[nameFontKey] || fonts["Helvetica"];
        const lsRaw = nameField.letterSpacing || 0;

        // Re-fit name the same way renderTextInField would (single-line, shrink loop).
        // The fit result is what actually got drawn — without it, over-long names would
        // produce a ruleSpan based on the un-shrunk width and spill past the layout.
        const maxWidthPt = mmToPt(nameField.width);
        let fittedSize = nameField.fontSize;
        let fittedLs = 0;
        let fittedInkWidthPt = 0;
        while (fittedSize >= nameField.minFontSize) {
          fittedLs = lsRaw === 0 ? 0 : (lsRaw / 1000) * fittedSize;
          fittedInkWidthPt = measureTracked(nameText, nameFont, fittedSize, fittedLs);
          if (fittedInkWidthPt <= maxWidthPt) break;
          fittedSize -= 0.5;
        }
        const inkWidthMm = fittedInkWidthPt / mmToPt(1);

        // Clamp bounds re-derived from the system's own layout constraints (Round 5 §1
        // task 2) instead of the previous round's round numbers (132 / 190mm), which were
        // never re-derived from real data:
        //  - Upper bound: nameField.width IS the hard ceiling on ink width — the shrink
        //    loop above guarantees fittedInkWidthPt <= maxWidthPt (barring the
        //    shrink_then_reject overflow case), so a rule can never legitimately need to
        //    span wider than the field itself, scaled by the same ratio.
        //  - Lower bound: measured from the shortest realistic name ("A B") set at the
        //    field's own minFontSize — the smallest ink width the fit loop would ever
        //    actually produce for a real two-part name — through the same ratio.
        const RULE_SPAN_RATIO = 0.88;
        const SHORTEST_REALISTIC_NAME = "A B";
        const shortestLsPt =
          lsRaw === 0 ? 0 : (lsRaw / 1000) * nameField.minFontSize;
        const shortestNameInkWidthMm =
          measureTracked(SHORTEST_REALISTIC_NAME, nameFont, nameField.minFontSize, shortestLsPt) /
          mmToPt(1);
        const minRuleSpanMm = shortestNameInkWidthMm * RULE_SPAN_RATIO;
        const maxRuleSpanMm = nameField.width * RULE_SPAN_RATIO;

        const ruleSpanMm = Math.max(
          minRuleSpanMm,
          Math.min(maxRuleSpanMm, inkWidthMm * RULE_SPAN_RATIO)
        );
        const centreX = nameField.x + nameField.width / 2;
        const diamondGapMm = 3.4;
        const ruleYMm = 78.2;
        const ruleThickMm = 0.34;
        const teal = hexToRgb("#0099B8");

        const leftStartX = centreX - ruleSpanMm / 2;
        const leftEndX = centreX - diamondGapMm;
        const leftWidthMm = Math.max(0, leftEndX - leftStartX);

        const rightStartX = centreX + diamondGapMm;
        const rightEndX = centreX + ruleSpanMm / 2;
        const rightWidthMm = Math.max(0, rightEndX - rightStartX);

        const pageH = page.getHeight();
        const ruleYpt = pageH - mmToPt(ruleYMm);
        const thickPt = mmToPt(ruleThickMm);

        if (leftWidthMm > 0) {
          page.drawLine({
            start: { x: mmToPt(leftStartX), y: ruleYpt },
            end: { x: mmToPt(leftStartX + leftWidthMm), y: ruleYpt },
            thickness: thickPt,
            color: teal,
          });
        }
        if (rightWidthMm > 0) {
          page.drawLine({
            start: { x: mmToPt(rightStartX), y: ruleYpt },
            end: { x: mmToPt(rightStartX + rightWidthMm), y: ruleYpt },
            thickness: thickPt,
            color: teal,
          });
        }
      }

      renderTextInField(page, template.fields.postRecipientText as any, "has successfully completed the", fonts, errors, warnings);

      renderTextInField(page, template.fields.programTitle as any, input.program.title, fonts, errors, warnings);

      const durFieldWithText = {
        ...template.fields.durationSentence,
        runs: [
          { ...(template.fields.durationSentence as any).runs![0], text: input.program.duration },
          { ...(template.fields.durationSentence as any).runs![1], text: " practical training program conducted by " },
          { ...(template.fields.durationSentence as any).runs![2], text: (input.trainingProvider || ISSUER_NAME_FALLBACK) },
          { ...(template.fields.durationSentence as any).runs![3], text: ", covering the following course modules:" },
        ]
      };
      renderTextInField(page, durFieldWithText, "", fonts, errors, warnings);

      renderTextInField(page, template.fields.courseModulesHeading as any, "COURSE MODULES", fonts, errors, warnings);

      const sorted = [...input.modules].sort((a, b) => a.order - b.order);
      const moduleCount = sorted.length;
      const { area } = template.moduleConstraints;

      if (moduleCount === 4) {
        // Exact match for the hand-tuned 4-column layout the design was built for.
        for (let idx = 0; idx < 4; idx++) {
          const numeralField = (template.fields as any)[`module${idx + 1}Numeral`];
          const titleField = (template.fields as any)[`module${idx + 1}Title`];
          const subtitleField = (template.fields as any)[`module${idx + 1}Subtitle`];
          const mod = sorted[idx];
          const numeralText = mod ? String(mod.order).padStart(2, "0") : "";
          const titleText = mod?.title ?? "";
          const subtitleText = mod?.subtitle ?? "";
          if (numeralField) renderTextInField(page, numeralField, numeralText, fonts, errors, warnings);
          if (titleField) renderTextInField(page, titleField, titleText, fonts, errors, warnings);
          if (subtitleField) renderTextInField(page, subtitleField, subtitleText, fonts, errors, warnings);
        }
      } else if (moduleCount > 0) {
        // Defensive fallback: spread N modules evenly across the full row instead of
        // bunching them into the first N of 4 fixed slots (which leaves a large empty gap).
        const baseNumeral = (template.fields as any).module1Numeral;
        const baseTitle = (template.fields as any).module1Title;
        const baseSubtitle = (template.fields as any).module1Subtitle;
        const columnWidth = area.width / moduleCount;

        sorted.forEach((mod, idx) => {
          const columnX = area.x + idx * columnWidth;
          const numeralField = { ...baseNumeral, x: columnX, width: columnWidth };
          const titleField = { ...baseTitle, x: columnX, width: columnWidth };
          const subtitleField = { ...baseSubtitle, x: columnX, width: columnWidth };
          renderTextInField(page, numeralField, String(mod.order).padStart(2, "0"), fonts, errors, warnings);
          renderTextInField(page, titleField, mod.title, fonts, errors, warnings);
          if (mod.subtitle) renderTextInField(page, subtitleField, mod.subtitle, fonts, errors, warnings);
        });
      }

      renderTextInField(page, template.fields.completionStatement as any, "Successfully completed all required course modules and demonstrated practical competency in the skills covered by the program", fonts, errors, warnings);

      if (input.grade) {
        const gradeFieldWithText = {
          ...template.fields.gradeBadgeText,
          runs: [
            { ...(template.fields.gradeBadgeText as any).runs![0], text: "Final Grade | " },
            { ...(template.fields.gradeBadgeText as any).runs![1], text: input.grade.toUpperCase() },
          ]
        };
        renderTextInField(page, gradeFieldWithText, "", fonts, errors, warnings);
      }

      renderTextInField(page, template.fields.certNumberLabel as any, "Certificate No.  |", fonts, errors, warnings);
      renderTextInField(page, template.fields.issueDateMetaLabel as any, "Issue Date  |", fonts, errors, warnings);

      const shortDate = new Date(input.issueDate).toISOString().slice(0, 10);
      renderTextInField(page, template.fields.certNumberValue as any, input.certificateNumber, fonts, errors, warnings);
      renderTextInField(page, template.fields.issueDateMetaValue as any, shortDate, fonts, errors, warnings);

      renderTextInField(page, template.fields.qrCaption1 as any, "DIGITAL VERIFICATION", fonts, errors, warnings);
      let verifyHostname = "darbarcomputer.edu.np";
      try {
        const u = new URL(input.verificationUrl);
        // Strip "www." and fall back to the bare host when the hostname plus
        // "/verify" cannot fit in the single-line qrCaption2c field (e.g.
        // darbarcomputer.edu.np/verify is 26 chars > the 24-char budget). The
        // QR code itself always carries the full verification URL.
        const host = u.hostname.replace(/^www\./, "");
        const candidate = `${host}/verify`;
        verifyHostname = candidate.length <= 24 ? candidate : host;
      } catch {}
      renderTextInField(page, template.fields.qrCaption2a as any, "Scan QR code to verify", fonts, errors, warnings);
      renderTextInField(page, template.fields.qrCaption2b as any, "authenticity online at", fonts, errors, warnings);
      renderTextInField(page, template.fields.qrCaption2c as any, verifyHostname, fonts, errors, warnings);

      const sig1Image = input.signatory.signatureAsset
        ? await loadPngWithAlphaBounds(doc, input.signatory.signatureAsset)
        : null;
      const secondarySig = input.secondarySignatory ?? (input.signatory as any).signatory2;
      const sig2Image = secondarySig?.signatureAsset
        ? await loadPngWithAlphaBounds(doc, secondarySig.signatureAsset)
        : null;

      const drawSignatureImage = (field: TemplateField, alpha: PngAlphaBounds | null) => {
        if (!alpha || !field || field.type !== "image") return;
        const fieldW = mmToPt(field.width);
        const fieldH = mmToPt(field.height);
        const fieldLeft = mmToPt(field.x);
        const fieldTopYmm = field.y;

        const visibleAspect = alpha.visibleW / alpha.visibleH;
        let drawVisibleW = fieldW;
        let drawVisibleH = fieldW / visibleAspect;
        if (drawVisibleH > fieldH) {
          drawVisibleH = fieldH;
          drawVisibleW = fieldH * visibleAspect;
        }
        const scale = drawVisibleW / alpha.visibleW;
        const drawBitmapW = alpha.bitmapW * scale;
        const drawBitmapH = alpha.bitmapH * scale;
        const insetLeftPt = alpha.visibleX * scale;
        const insetTopPt = alpha.visibleY * scale;
        const visibleCenteredX = fieldLeft + (fieldW - drawVisibleW) / 2;
        const drawX = visibleCenteredX - insetLeftPt;
        const bitmapTopFromTopOfPagePt = mmToPt(fieldTopYmm) - insetTopPt;
        const drawY = pageHeight - bitmapTopFromTopOfPagePt - drawBitmapH;
        page.drawImage(alpha.image, {
          x: drawX,
          y: drawY,
          width: drawBitmapW,
          height: drawBitmapH,
        });
      };

      drawSignatureImage(template.fields.signatory1Signature as any, sig1Image);
      drawSignatureImage(template.fields.signatory2Signature as any, sig2Image);

      renderTextInField(page, template.fields.issueDateLabel as any, "Date of issue", fonts, errors, warnings);
      renderTextInField(page, template.fields.issueDateValue as any, formatCertificateDate(input.issueDate), fonts, errors, warnings);
      renderTextInField(page, template.fields.signatory1Label as any, "Authorized Signatory", fonts, errors, warnings);
      renderTextInField(page, template.fields.signatory1Name as any, input.signatory.name, fonts, errors, warnings);
      const sig2Name = secondarySig?.name || "Mohan Shahi";
      const sig2Title = secondarySig?.position || "Managing Director";
      renderTextInField(page, template.fields.signatory2Label as any, sig2Title, fonts, errors, warnings);
      renderTextInField(page, template.fields.signatory2Name as any, sig2Name, fonts, errors, warnings);

      renderTextInField(page, template.fields.footerVerified as any, "Verified & Authentic", fonts, errors, warnings);
      renderTextInField(page, template.fields.footerCertNumber as any, `CERTIFICATE NO. ${input.certificateNumber}`, fonts, errors, warnings);
      renderTextInField(page, template.fields.footerContact as any, "www.darbartech.com | info@darbartech.com | +977-9865365409", fonts, errors, warnings);
    } else {
      renderTextInField(page, template.fields.mainTitle, "CERTIFICATE OF COMPLETION", fonts, errors, warnings);
      renderTextInField(page, template.fields.mainSubtitle, "DARBARTECH GROUP OF TECHNOLOGY", fonts, errors, warnings);
      renderTextInField(page, template.fields.preRecipientText, "This certificate is proudly presented to", fonts, errors, warnings);

      renderTextInField(page, template.fields.recipientName, input.recipient.name, fonts, errors, warnings);

      const recipientField = template.fields.recipientName;
      const recipientFit = fitTextToField(input.recipient.name, recipientField);
      const lastLineW = recipientFit.lines.length > 0 ?
        fonts[recipientField.font || "Helvetica"].widthOfTextAtSize(
          recipientFit.lines[recipientFit.lines.length - 1],
          recipientFit.fontSize
        ) : 0;
      const underlineW = Math.min(Math.max(lastLineW + 40, mmToPt(80)), mmToPt(200));
      const underlineX = (pageWidth - underlineW) / 2;
      const underlineY = pageHeight - mmToPt(recipientField.y) - mmToPt(recipientField.height) + mmToPt(2);
      const goldColor = hexToRgb(template.colors.brandGold?.hex || "#c9a227");
      page.drawLine({
        start: { x: underlineX, y: underlineY },
        end: { x: underlineX + underlineW, y: underlineY },
        color: goldColor,
        thickness: 0.8,
      });

      renderTextInField(page, template.fields.postRecipientLine, "having successfully completed the following program:", fonts, errors, warnings);

      renderTextInField(page, template.fields.duration, `DURATION: ${input.program.duration.toUpperCase()}`, fonts, errors, warnings);
      renderTextInField(page, template.fields.programTitle, input.program.title, fonts, errors, warnings);

      renderTextInField(page, template.fields.issuedBy, "ISSUED BY:\nDarbarTech Group", fonts, errors, warnings);

      if (input.grade) {
        renderTextInField(page, template.fields.gradeLabel, "GRADE / RESULT", fonts, errors, warnings);
        renderTextInField(page, template.fields.grade, input.grade.toUpperCase(), fonts, errors, warnings);
      }

      if (input.completionDate) {
        renderTextInField(page, template.fields.completionLabel, "COMPLETION DATE", fonts, errors, warnings);
        renderTextInField(page, template.fields.completionDate, formatCertificateDate(input.completionDate), fonts, errors, warnings);
      }

      renderTextInField(page, template.fields.issueLabel, "DATE OF ISSUE", fonts, errors, warnings);
      renderTextInField(page, template.fields.issueDate, formatCertificateDate(input.issueDate), fonts, errors, warnings);

      const signY = mmToPt(template.signatureConfig.y + template.signatureConfig.height + 2);
      const signX = mmToPt(template.signatureConfig.x);
      const signW = mmToPt(template.signatureConfig.width);
      const signLineY = pageHeight - signY + mmToPt(template.signatureConfig.height);
      const navyColor = hexToRgb(template.colors.brandNavy?.hex || "#0a2463");
      page.drawLine({
        start: { x: signX, y: signLineY },
        end: { x: signX + signW, y: signLineY },
        color: navyColor,
        thickness: 0.6,
      });

      renderTextInField(page, template.fields.signatoryName, input.signatory.name, fonts, errors, warnings);
      renderTextInField(page, template.fields.signatoryPosition, input.signatory.position, fonts, errors, warnings);

      renderTextInField(page, template.fields.certificateNumberLabel, "CERTIFICATE NO.", fonts, errors, warnings);
      renderTextInField(page, template.fields.certificateNumber, input.certificateNumber, fonts, errors, warnings);

      renderTextInField(
        page,
        template.fields.footerText,
        "DarbarTech Group of Technology | Verify authenticity at the official website",
        fonts,
        errors
      );
    }

    if (!isV2) {
      renderModules(page, input.modules, template, fonts, errors, warnings);
    }

    try {
      const qrSizeMm = template.qrConfig.size;
      const qrDataUrl = await generateQrCodeDataUrl(
        input.verificationUrl,
        qrSizeMm,
        template.page.dpi,
        template.qrConfig.errorCorrection,
        template.qrConfig.margin
      );
      const qrBase64 = qrDataUrl.split(",")[1];
      const qrBytes = Uint8Array.from(Buffer.from(qrBase64, "base64"));
      const qrImage = await doc.embedPng(qrBytes);

      const qrSizePt = mmToPt(qrSizeMm);
      const qrXpt = mmToPt(template.qrConfig.x);
      const qrYpt = pageHeight - mmToPt(template.qrConfig.y + qrSizeMm);

      const qrBorderMm = (template.qrConfig as any).borderMm ?? 0;
      const qrBorderColor = (template.qrConfig as any).borderColor;
      if (qrBorderMm > 0 && qrBorderColor) {
        const bPt = mmToPt(qrBorderMm);
        page.drawRectangle({
          x: qrXpt - bPt,
          y: qrYpt - bPt,
          width: qrSizePt + bPt * 2,
          height: qrSizePt + bPt * 2,
          borderColor: hexToRgb(qrBorderColor),
          borderWidth: bPt,
        });
      }

      page.drawImage(qrImage, {
        x: qrXpt,
        y: qrYpt,
        width: qrSizePt,
        height: qrSizePt,
      });

      if (!isV2) {
        const qrLabelFont = fonts["Helvetica"];
        const qrLabelSize = 6.5;
        const qrLabelText = "VERIFY";
        const qrLabelW = qrLabelFont.widthOfTextAtSize(qrLabelText, qrLabelSize);
        const qrLabelX = qrXpt + (qrSizePt - qrLabelW) / 2;
        const qrLabelY = qrYpt - qrLabelSize - 2;
        page.drawText(qrLabelText, {
          x: qrLabelX,
          y: qrLabelY,
          size: qrLabelSize,
          font: qrLabelFont,
          color: hexToRgb(template.colors.brandNavy?.hex || "#0a2463"),
        });
      }
    } catch (qrError) {
      errors.push(`QR code generation failed: ${qrError instanceof Error ? qrError.message : String(qrError)}`);
    }

    doc.setProducer("DarbarTech Certificate Engine");
    doc.setCreator("DarbarTech Certificate System");
    doc.setTitle(`Certificate ${input.certificateNumber}`);
    doc.setAuthor("DarbarTech Group of Technology");
    doc.setSubject(`Certificate ${input.certificateNumber} - ${input.recipient.name}`);

    const pdfBytes = await doc.save();

    return {
      success: errors.length === 0,
      data: Buffer.from(pdfBytes),
      contentType: "application/pdf",
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (err) {
    return {
      success: false,
      contentType: "application/pdf",
      errors: [`PDF rendering failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
};

export const renderCertificatePreview = async (
  input: CertificateRenderInput,
  template: TemplateConfig = DARBARTECH_CERTIFICATE_TEMPLATE
): Promise<RenderResult> => {
  const pdfResult = await renderCertificatePdf(input, template);
  return pdfResult;
};

export interface CertificateRenderer {
  renderPreview(input: CertificateRenderInput, template?: TemplateConfig): Promise<RenderResult>;
  renderPrintPdf(input: CertificateRenderInput, template?: TemplateConfig): Promise<RenderResult>;
}

export const certificateRenderer: CertificateRenderer = {
  renderPreview: renderCertificatePreview,
  renderPrintPdf: renderCertificatePdf,
};
