import "server-only";

/**
 * Types for the pdf-lib certificate engine.
 *
 * Verbatim port of the render contract from the reference Certificate-Generation
 * project (`src/lib/types.ts`). Only the module path changed — no field was added,
 * renamed, removed, or retyped, so the renderer and both templates behave exactly
 * as they do there.
 */

export type TextRun = {
  text: string;
  font: string;
  fontSize: number;
  color: string;
};

export type TemplateField = {
  field: string;
  type: "text" | "date" | "module_list" | "qr" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  capHeightMm?: number;
  font: string;
  fontSize: number;
  weight: string | number;
  color: string;
  alignment: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  maxLines: number;
  minFontSize: number;
  overflowPolicy: "shrink_then_reject" | "wrap_then_shrink" | "reject";
  required: boolean;
  runs?: TextRun[];
  transformUppercase?: boolean;
};

export type ShapeConfig =
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: string;
      stroke?: string;
      strokeWidthMm?: number;
      rotationDeg?: number;
      cornerRadiusMm?: number;
      layer?: number;
    }
  | {
      kind: "triangle";
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: string;
      stroke?: string;
      strokeWidthMm?: number;
      rotationDeg?: number;
      layer?: number;
    }
  | {
      kind: "line";
      x: number;
      y: number;
      width: number;
      height: number;
      stroke?: string;
      strokeWidthMm?: number;
      rotationDeg?: number;
      orientation?: "horizontal" | "vertical";
      layer?: number;
    }
  | {
      kind: "polygon";
      points: Array<{ x: number; y: number }>;
      fill?: string;
      stroke?: string;
      strokeWidthMm?: number;
      rotationDeg?: number;
      layer?: number;
    };

export type TemplateConfig = {
  templateId: string;
  version: string;
  rendererVersion: string;
  page: {
    width: number;
    height: number;
    unit: "mm" | "in" | "px";
    dpi: number;
    orientation: "portrait" | "landscape";
    colorMode: "CMYK" | "RGB";
  };
  safeArea: {
    topMm: number;
    rightMm: number;
    bottomMm: number;
    leftMm: number;
  };
  moduleConstraints: {
    minCount: number;
    maxCount: number;
    maxTitleLength: number;
    maxSubtitleLength: number;
    area: {
      x: number;
      y: number;
      width: number;
      height: number;
      gap: number;
    };
    item: {
      titleFont: string;
      titleSize: number;
      titleWeight: string | number;
      titleColor: string;
      subtitleFont: string;
      subtitleSize: number;
      subtitleWeight: string | number;
      subtitleColor: string;
      alignment: "left" | "center" | "right";
    };
  };
  fields: Record<string, TemplateField>;
  shapes?: ShapeConfig[];
  staticAssets: {
    logo?: string;
    background?: string;
    border?: string;
    watermarkLogo?: string;
  };
  qrConfig: {
    x: number;
    y: number;
    size: number;
    errorCorrection: "L" | "M" | "Q" | "H";
    margin: number;
    borderMm?: number;
    borderColor?: string;
  };
  signatureConfig: {
    x: number;
    y: number;
    width: number;
    height: number;
    nameFont: string;
    nameSize: number;
    nameWeight: string | number;
    positionFont: string;
    positionSize: number;
  };
  colors: Record<string, { cmyk?: string; hex: string; hexSrgb?: string }>;
};

export type CertificateModule = {
  order: number;
  title: string;
  subtitle?: string;
};

export type CertificateRenderInput = {
  templateId: string;
  templateVersion: string;
  rendererVersion: string;

  certificateNumber: string;

  recipient: {
    name: string;
  };

  program: {
    title: string;
    duration: string;
  };

  trainingProvider?: string;

  modules: CertificateModule[];

  grade?: string;

  completionDate?: string;
  issueDate: string;

  signatory: {
    name: string;
    position: string;
    signatureAsset?: string;
  };

  secondarySignatory?: {
    name: string;
    position: string;
    signatureAsset?: string;
  };

  verificationUrl: string;
};

export type RenderResult = {
  success: boolean;
  data?: Buffer;
  contentType: "application/pdf" | "image/png" | "image/jpeg";
  errors?: string[];
  warnings?: string[];
};
