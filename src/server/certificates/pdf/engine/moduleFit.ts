import type { TemplateConfig, TemplateField, CertificateModule } from "./types";
import { fitTextToField } from "./textFitting";

export interface ModuleFitIssue {
  order: number;
  field: string;
  tileLabel: string;
  textToRender: string;
  originalText: string;
  hard: boolean;
  reason: string;
}

const MODULE_TILE_FIELDS = [
  { order: 1, title: "module1Title", subtitle: "module1Subtitle" },
  { order: 2, title: "module2Title", subtitle: "module2Subtitle" },
  { order: 3, title: "module3Title", subtitle: "module3Subtitle" },
  { order: 4, title: "module4Title", subtitle: "module4Subtitle" },
] as const;

const getTileTemplate = (
  template: TemplateConfig,
  order: number
): { title: TemplateField | null; subtitle: TemplateField | null } | null => {
  const def = MODULE_TILE_FIELDS.find((t) => t.order === order);
  if (!def) return null;
  const f = template.fields || {};
  return {
    title: f[def.title] || null,
    subtitle: f[def.subtitle] || null,
  };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- carried over from the reference renderer
const getFontWidthFactor = (fontName: string): number => {
  const F: Record<string, number> = {
    "Montserrat-Regular": 0.54,
    "Montserrat-Medium": 0.55,
    "Montserrat-SemiBold": 0.57,
    "Montserrat-Bold": 0.59,
    "Montserrat-ExtraBold": 0.61,
    "CormorantGaramond-Regular": 0.44,
    "CormorantGaramond-Bold": 0.46,
    "PlayfairDisplay-Bold": 0.48,
  };
  return F[fontName] ?? 0.55;
};

const transformUppercase = (text: string, field: TemplateField): string =>
  field.transformUppercase ? text.toUpperCase() : text;

const describe = (
  order: number,
  field: string,
  tileLabel: string,
  text: string,
  originalText: string,
  hard: boolean,
  reason: string
): ModuleFitIssue => ({
  order,
  field,
  tileLabel,
  textToRender: text,
  originalText,
  hard,
  reason: `${reason} (field geometry — see certificate v2 / 4-column tile layout; documented minimum font: 6.7pt title / 5.3pt subtitle).`,
});

/**
 * Pre-flight issue collector — mirrors the renderer's exact fit math against
 * the documented minimum font, so the admin form and the PDF renderer can
 * never disagree about whether a module tile fits. Empty array = the four
 * module tiles are geometrically safe to issue.
 */
export const collectModuleFitIssues = (
  template: TemplateConfig,
  modules: CertificateModule[]
): ModuleFitIssue[] => {
  const issues: ModuleFitIssue[] = [];

  for (const mod of modules) {
    const tiles = getTileTemplate(template, mod.order);
    if (!tiles) {
      issues.push(
        describe(
          mod.order,
          `module${mod.order}Title`,
          `Module ${mod.order}`,
          mod.title || "",
          mod.title || "",
          true,
          `The v2 template defines module tiles 1-4 only; module order ${mod.order} has no tile. Prevent issuance (fail loud, never silently distort).`
        )
      );
      continue;
    }

    const titleField = tiles.title;
    const subtitleField = tiles.subtitle;
    const text = transformUppercase(mod.title || "", titleField || ({} as TemplateField));

    if (titleField && text) {
      const fit = fitTextToField(text, titleField);
      if (!fit.fits) {
        issues.push(
          describe(
            mod.order,
            titleField.field || `module${mod.order}Title`,
            `Module ${mod.order} — Title`,
            text,
            mod.title || "",
            fit.fontSize <= (titleField.minFontSize || 0) + 0.001,
            `"${mod.title}" cannot render in the fixed ${titleField.width}mm tile at
1 line with letterSpacing — the renderer would refuse to distort it. Shorten the module title to fit the 4-column v2 geometry.`
          )
        );
      }
    }

    if (subtitleField && mod.subtitle) {
      const textSub = mod.subtitle;
      const fitSub = fitTextToField(textSub, subtitleField);
      if (!fitSub.fits) {
        issues.push(
          describe(
            mod.order,
            subtitleField.field || `module${mod.order}Subtitle`,
            `Module ${mod.order} — Subtitle`,
            textSub,
            mod.subtitle,
            fitSub.fontSize <= (subtitleField.minFontSize || 0) + 0.001,
            `"${mod.subtitle}" cannot render in the fixed ${subtitleField.width}mm subtitle tile at 1 line — the renderer would refuse to distort it. Shorten the module subtitle.`
          )
        );
      }
    }
  }

  return issues;
};
