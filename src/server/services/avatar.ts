import "server-only";
import { headers } from "next/headers";
import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_BYTES } from "@/server/constants";
import {
  allowedFormatsParam,
  getStorageConfig,
  sniffImageMimeType,
  verifyUploadedAsset,
  writeLocalUpload,
} from "./storage";

/**
 * Server-side image storage for profile pictures.
 *
 * Staff media uploads are signed and go browser-to-Cloudinary (`media.upload`),
 * which students and counselors do not have. A profile picture instead travels
 * through a Server Action owned by the user, so this helper holds the one copy
 * of the validate-and-store logic both `account` and `student` actions use.
 */

export const AVATAR_BAD_TYPE = "Use a JPG, PNG, WebP or AVIF image";
export const AVATAR_TOO_LARGE = `Image is too large (max ${Math.floor(MEDIA_MAX_BYTES / (1024 * 1024))} MB)`;
export const AVATAR_NOT_CONFIGURED = "Uploads are not configured on this server";

export type StoredAvatar = {
  url: string;
  publicId: string;
  bytes: number;
  width: number | null;
  height: number | null;
  mimeType: string;
};

export type StoreAvatarResult =
  | { ok: true; stored: StoredAvatar }
  | { ok: false; error: string };

export async function storeAvatarImage(
  file: unknown,
  folder: string
): Promise<StoreAvatarResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image first" };
  }
  if (!(MEDIA_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: AVATAR_BAD_TYPE };
  }
  if (file.size > MEDIA_MAX_BYTES) {
    return { ok: false, error: AVATAR_TOO_LARGE };
  }

  const data = new Uint8Array(await file.arrayBuffer());
  // `File.type` is written by the browser. Without this check a student could hand
  // an SVG to Cloudinary, which would serve it as image/svg+xml from their own
  // trusted origin — a stored XSS on res.cloudinary.com.
  const actualType = sniffImageMimeType(data);
  if (!actualType || actualType !== file.type) {
    return { ok: false, error: AVATAR_BAD_TYPE };
  }

  const config = getStorageConfig();
  if (!config) return { ok: false, error: AVATAR_NOT_CONFIGURED };

  if (config.provider === "cloudinary") {
    const { cloudName, apiKey, apiSecret } = config;
    if (!cloudName || !apiKey || !apiSecret) {
      return { ok: false, error: AVATAR_NOT_CONFIGURED };
    }
    const form = new FormData();
    form.append("file", new Blob([data as BlobPart], { type: actualType }), file.name);
    form.append("folder", folder);
    // This upload is authenticated rather than signed, so the format restriction is
    // sent in plain sight — the post-response verification below is what enforces it.
    form.append("allowed_formats", allowedFormatsParam());
    form.append("overwrite", "false");
    form.append("use_filename", "true");
    form.append("unique_filename", "true");

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
        },
        body: form,
      }
    );
    if (!response.ok) throw new Error(`Cloudinary upload failed (${response.status})`);

    const result = await response.json();
    const verified = verifyUploadedAsset(result, config, { folder });
    return {
      ok: true,
      stored: {
        url: verified.url,
        publicId: verified.publicId,
        bytes: verified.bytes,
        width: verified.width,
        height: verified.height,
        mimeType: verified.mimeType,
      },
    };
  }

  const h = await headers();
  const host = h.get("host") ?? h.get("x-forwarded-host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/i.test(host) ? "http" : "https");
  const result = await writeLocalUpload(
    { data, mimeType: actualType },
    `${proto}://${host}`
  );
  return {
    ok: true,
    stored: {
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      width: result.width ?? null,
      height: result.height ?? null,
      mimeType: actualType,
    },
  };
}
