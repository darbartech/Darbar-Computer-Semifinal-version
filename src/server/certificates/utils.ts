import "server-only";

export function formatNepaliLongDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kathmandu",
  }).toUpperCase();
}

export function formatNepaliShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kathmandu",
  });
}

export function sanitizeForLog(value: string | null | undefined, maxLen = 40): string {
  if (!value) return "";
  const truncated = value.length > maxLen ? value.slice(0, maxLen) + "…" : value;
  return truncated.replace(/\s+/g, " ").replace(/[^\w\s\-_./]/g, "?");
}

export function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function safeFileNamePart(value: string | null | undefined, fallback = "certificate"): string {
  if (!value) return fallback;
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || fallback;
}

/**
 * A usable base URL must point at something a certificate checker could actually
 * reach. Loopback/private dev hosts (localhost, 127.x, LAN ranges) are not that:
 * a PDF's QR is baked at issue time, so if it encodes a dev host the QR is dead
 * forever for any third party. Prefer the server-side SITE_URL, then the public
 * NEXT_PUBLIC_SITE_URL, then the official store domain.
 */
function usablePublicBaseUrl(value: string | undefined): string | null {
  const url = value?.trim().replace(/\/+$/, "");
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "").replace(/^www\./, "");
    if (host.length === 0) return null;
    if (/^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0)$/i.test(host)) return null;
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

export function resolveOfficialDomain(): string {
  return (
    usablePublicBaseUrl(process.env.SITE_URL) ??
    usablePublicBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    "https://darbarcomputer.edu.np"
  );
}
