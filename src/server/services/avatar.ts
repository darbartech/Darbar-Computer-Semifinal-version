import "server-only";
import { headers } from "next/headers";
import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_BYTES } from "@/server/constants";
import { getStorageConfig, writeLocalUpload } from "./storage";

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

  const config = getStorageConfig();
  if (!config) return { ok: false, error: AVATAR_NOT_CONFIGURED };

  if (config.provider === "cloudinary") {
    const { cloudName, apiKey, apiSecret } = config;
    if (!cloudName || !apiKey || !apiSecret) {
      return { ok: false, error: AVATAR_NOT_CONFIGURED };
    }
    const form = new FormData();
    form.append("file", file);
    form.append("folder", folder);
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

    const result = (await response.json()) as {
      public_id: string;
      secure_url: string;
      bytes?: number;
      width?: number;
      height?: number;
    };
    if (!result.public_id.startsWith(`${folder}/`)) {
      throw new Error("Upload landed outside the expected folder");
    }
    return {
      ok: true,
      stored: {
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes ?? file.size,
        width: result.width ?? null,
        height: result.height ?? null,
        mimeType: file.type,
      },
    };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/i.test(host) ? "http" : "https");
  const result = await writeLocalUpload(
    { data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type },
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
      mimeType: file.type,
    },
  };
}
