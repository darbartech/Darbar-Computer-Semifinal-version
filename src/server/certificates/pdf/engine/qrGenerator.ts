import QRCode from "qrcode";

export const generateQrCodeDataUrl = async (
  url: string,
  sizeMm: number,
  dpi: number,
  errorCorrection: "L" | "M" | "Q" | "H" = "M",
  margin: number = 1
): Promise<string> => {
  const pixelsPerMm = dpi / 25.4;
  const sizePx = Math.round(sizeMm * pixelsPerMm);

  return QRCode.toDataURL(url, {
    width: sizePx,
    margin,
    errorCorrectionLevel: errorCorrection,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
};

export const generateQrCodeBuffer = async (
  url: string,
  sizeMm: number,
  dpi: number,
  errorCorrection: "L" | "M" | "Q" | "H" = "M",
  margin: number = 1
): Promise<Buffer> => {
  const pixelsPerMm = dpi / 25.4;
  const sizePx = Math.round(sizeMm * pixelsPerMm);

  return new Promise((resolve, reject) => {
    QRCode.toBuffer(
      url,
      {
        width: sizePx,
        margin,
        errorCorrectionLevel: errorCorrection,
        type: "png",
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      },
      (err, buffer) => {
        if (err) reject(err);
        else resolve(buffer);
      }
    );
  });
};

export const extractQrDataUrlSize = (dataUrl: string): { width: number; height: number } => {
  try {
    const base64 = dataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > 24 && buffer.toString("ascii", 1, 8) === "PNG\r\n\x1a\n") {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }
  } catch {}
  return { width: 128, height: 128 };
};
