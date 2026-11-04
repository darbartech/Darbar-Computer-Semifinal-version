import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_CLOUDINARY_FORMAT_TO_MIME,
  MEDIA_MAX_BYTES,
  MEDIA_UPLOAD_FOLDER,
  type MediaAllowedMimeType,
} from "@/server/constants";

/**
 * Uploads (docs/02 §2, docs/08 §1 "Uploads").
 *
 * Two providers behind one contract:
 *
 * - `cloudinary` — the production path. Signed parameters are computed here
 *   with `node:crypto` rather than adding the vendor SDK: the surface we need
 *   is one signature and one destroy call. The file goes browser -> Cloudinary
 *   and never touches the Next.js server.
 * - `local` — development only. With no Cloudinary credentials the browser
 *   posts to our own route, which writes into `public/uploads`. Same folder
 *   allow-list, MIME allow-list and size limit, and the `Media` row is written
 *   through the same verification path, so a local library row is shaped
 *   exactly like a Cloudinary one.
 *
 * Set `MEDIA_STORAGE_PROVIDER=cloudinary` to force Cloudinary, or
 * `MEDIA_STORAGE_PROVIDER=local` to allow local disk outside development.
 */

export type StorageProvider = "cloudinary" | "local";

export type StorageConfig = {
  provider: StorageProvider;
  /** Null for the local provider. */
  cloudName: string | null;
  apiKey: string | null;
  apiSecret: string | null;
};

/** Route the browser POSTs the file to when the local provider is active. */
export const LOCAL_UPLOAD_ENDPOINT = "/api/upload/local";

/** `public/uploads` — where local files are written and served from. */
const LOCAL_UPLOAD_DIR = path.join("public", "uploads");

/** URL prefix that maps to `LOCAL_UPLOAD_DIR`. */
const LOCAL_UPLOAD_URL_PREFIX = "/uploads";

const MIME_TO_EXTENSION: Record<MediaAllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Magic-number check for the four accepted image types.
 *
 * `File.type` is written by the browser and is free to lie, so the declared MIME
 * alone cannot decide what a stored file really is. This is the byte-level truth
 * used to reject a mismatch before anything is written or registered.
 */
export function sniffImageMimeType(data: Uint8Array): MediaAllowedMimeType | null {
  const at = (offset: number, bytes: number[]) =>
    data.length >= offset + bytes.length && bytes.every((b, i) => data[offset + i] === b);

  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp";
  }
  // ISO-BMFF: size(4) "ftyp"(4) brand(4), with the AVIF brands.
  if (at(4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = [data[8], data[9], data[10], data[11]];
    const brands: number[][] = [
      [0x61, 0x76, 0x69, 0x66], // avif
      [0x61, 0x76, 0x69, 0x73], // avis
      [0x61, 0x76, 0x69, 0x6f], // avio
    ];
    if (brands.some((b) => b.every((v, i) => v === brand[i]))) return "image/avif";
  }
  return null;
}

/**
 * Local disk is a development convenience. It is on by default under
 * `next dev` and off everywhere else unless it is asked for explicitly, so a
 * production deploy can never silently start writing to a container filesystem.
 */
export function isLocalStorageEnabled(): boolean {
  const explicit = process.env.MEDIA_STORAGE_PROVIDER?.trim().toLowerCase();
  if (explicit === "local") return true;
  if (explicit === "cloudinary") return false;
  return process.env.NODE_ENV === "development";
}

export function getStorageConfig(): StorageConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (cloudName && apiKey && apiSecret) {
    return { provider: "cloudinary", cloudName, apiKey, apiSecret };
  }
  if (isLocalStorageEnabled()) {
    return { provider: "local", cloudName: null, apiKey: null, apiSecret: null };
  }
  return null;
}

/** Thrown when storage is not configured — surfaces as a 503 to the client. */
export class StorageNotConfiguredError extends Error {
  readonly status = 503;
  constructor() {
    super(
      "Uploads are not configured on this server. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (see .env.example), or set MEDIA_STORAGE_PROVIDER=local to store uploads on local disk during development."
    );
  }
}

export function assertStorageConfigured(): StorageConfig {
  const config = getStorageConfig();
  if (!config) throw new StorageNotConfiguredError();
  return config;
}

/**
 * Cloudinary parameter signature: base64(sha1(sortedParams + apiSecret)).
 * The client cannot alter a signed parameter without invalidating it, which is
 * what makes the folder allow-list and `allowed_formats` enforceable.
 */
export function signParams(
  params: Record<string, string | number | boolean>,
  apiSecret: string
): string {
  const toSign = Object.entries(params)
    .filter(([, v]) => v !== "" && v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return createHash("sha1")
    .update(toSign + apiSecret)
    .digest("base64");
}

export type SignedUploadParams = {
  /** Where the browser POSTs the file. */
  uploadUrl: string;
  /** The full, signed field set to send alongside the file. */
  fields: Record<string, string | number | boolean>;
  /** Convenience values for the client-side pre-checks and UI copy. */
  limits: {
    maxBytes: number;
    allowedMimeTypes: readonly string[];
    folder: string;
  };
};

export type SignUploadInput = {
  /** The MIME type the browser reports. Verified again after upload. */
  mimeType: string;
  /** The file size the browser reports. Verified again after upload. */
  sizeBytes: number;
};

/**
 * Produces the parameter set for one upload. Throws `UploadValidationError` when
 * the declared type or size is not acceptable, so the file never leaves the
 * browser at all.
 */
export function createSignedUpload(
  input: SignUploadInput
): SignedUploadParams {
  const config = assertStorageConfigured();
  const { mimeType, sizeBytes } = input;

  assertAllowedMimeType(mimeType);
  assertWithinSizeLimit(sizeBytes);

  const limits = {
    maxBytes: MEDIA_MAX_BYTES,
    allowedMimeTypes: MEDIA_ALLOWED_MIME_TYPES,
    folder: MEDIA_UPLOAD_FOLDER,
  };

  // Local disk needs no signature: our own route re-checks the session, the
  // MIME allow-list and the size limit before writing anything.
  if (config.provider === "local") {
    return { uploadUrl: LOCAL_UPLOAD_ENDPOINT, fields: {}, limits };
  }

  const { cloudName, apiKey, apiSecret } = config;
  if (!cloudName || !apiKey || !apiSecret) throw new StorageNotConfiguredError();

  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp,
    folder: MEDIA_UPLOAD_FOLDER,
    // Signed => Cloudinary rejects any MIME outside this list.
    allowed_formats: allowedFormatsParam(),
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  };

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    fields: {
      ...params,
      api_key: apiKey,
      signature: signParams(params, apiSecret),
    },
    limits,
  };
}

export class UploadValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
  }
}

function formatForCloudinary(mime: MediaAllowedMimeType): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
  }
}

/** The `allowed_formats` value that makes Cloudinary reject anything else, SVG included. */
export function allowedFormatsParam(): string {
  return MEDIA_ALLOWED_MIME_TYPES.map(formatForCloudinary).join(",");
}

export function assertAllowedMimeType(mimeType: string): asserts mimeType is MediaAllowedMimeType {
  if (!(MEDIA_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new UploadValidationError(
      `Unsupported file type. Allowed: ${MEDIA_ALLOWED_MIME_TYPES.join(", ")}`
    );
  }
}

export function assertWithinSizeLimit(sizeBytes: number): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new UploadValidationError("File is empty");
  }
  if (sizeBytes > MEDIA_MAX_BYTES) {
    throw new UploadValidationError(
      `File is too large. Maximum size is ${Math.floor(MEDIA_MAX_BYTES / (1024 * 1024))} MB`
    );
  }
}

/**
 * The shape of the fields Cloudinary returns after a successful upload. We only
 * trust these after re-validating them, because the response is produced by
 * Cloudinary but relayed by the browser.
 */
export type CloudinaryUploadResult = {
  public_id: string;
  secure_url: string;
  bytes: number;
  width?: number;
  height?: number;
  format?: string;
  resource_type?: string;
};

export type VerifiedUpload = {
  publicId: string;
  url: string;
  bytes: number;
  width: number | null;
  height: number | null;
  mimeType: MediaAllowedMimeType;
  folder: string;
};

/**
 * Re-validates an upload after the fact. The client-supplied type and size
 * checks above are advisory; these are the ones that decide whether a `Media`
 * row may be created.
 */
export function verifyUploadedAsset(
  result: CloudinaryUploadResult,
  config: StorageConfig,
  options: { requestOrigin?: string | null; folder?: string } = {}
): VerifiedUpload {
  if (typeof result?.public_id !== "string" || !result.public_id) {
    throw new UploadValidationError("Upload did not return an asset id");
  }
  if (typeof result.secure_url !== "string" || !result.secure_url) {
    throw new UploadValidationError("Upload did not return a URL");
  }

  // Folder allow-list: the client cannot move the asset out of our folder.
  const folder = result.public_id.includes("/")
    ? result.public_id.slice(0, result.public_id.lastIndexOf("/"))
    : "";
  if (folder !== (options.folder ?? MEDIA_UPLOAD_FOLDER)) {
    throw new UploadValidationError("Upload landed outside the allowed folder");
  }

  let url: URL;
  try {
    url = new URL(result.secure_url);
  } catch {
    throw new UploadValidationError("Upload returned an invalid URL");
  }

  if (config.provider === "local") {
    // Must be our own origin, under the uploads directory, and must name the
    // exact asset that was reported — nothing else is servable.
    //
    // With a configured site origin that is the only host that may be stored.
    // Without one (development, or a deployment that never set NEXT_PUBLIC_SITE_URL)
    // the origin the admin actually browsed from is accepted too, because local
    // development is routinely reached over the LAN address (`http://192.168.x.x:3001`)
    // instead of localhost.
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new UploadValidationError("Upload returned an unexpected delivery host");
    }
    const canonical = siteOrigin();
    const requestDerivedOrigin =
      canonical && process.env.NODE_ENV === "production"
        ? null
        : normalizeOrigin(options.requestOrigin);
    const allowedOrigins = [canonical, requestDerivedOrigin].filter(
      (value): value is string => Boolean(value)
    );
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(url.origin)) {
      throw new UploadValidationError("Upload returned an unexpected delivery host");
    }
    if (url.pathname !== `${LOCAL_UPLOAD_URL_PREFIX}/${result.public_id}`) {
      throw new UploadValidationError("Upload returned an unexpected delivery path");
    }
  } else {
    // The URL host must be the configured Cloudinary delivery host.
    if (url.protocol !== "https:" || url.hostname !== `res.cloudinary.com`) {
      throw new UploadValidationError("Upload returned an unexpected delivery host");
    }
    if (!url.pathname.startsWith(`/${config.cloudName}/`)) {
      throw new UploadValidationError("Upload returned an unexpected cloud name");
    }
  }

  if (result.resource_type && result.resource_type !== "image") {
    throw new UploadValidationError("Only image uploads are allowed");
  }

  const mimeType = result.format
    ? MEDIA_CLOUDINARY_FORMAT_TO_MIME[result.format.toLowerCase()]
    : undefined;
  if (!mimeType) {
    throw new UploadValidationError(
      `Unsupported file type. Allowed: ${MEDIA_ALLOWED_MIME_TYPES.join(", ")}`
    );
  }

  if (!Number.isFinite(result.bytes) || result.bytes <= 0) {
    throw new UploadValidationError("Upload reported an empty file");
  }
  if (result.bytes > MEDIA_MAX_BYTES) {
    throw new UploadValidationError(
      `File is too large. Maximum size is ${Math.floor(MEDIA_MAX_BYTES / (1024 * 1024))} MB`
    );
  }

  return {
    publicId: result.public_id,
    url: result.secure_url,
    bytes: result.bytes,
    width: Number.isFinite(result.width) ? (result.width as number) : null,
    height: Number.isFinite(result.height) ? (result.height as number) : null,
    mimeType,
    folder,
  };
}

/** Removes the asset from storage. Best-effort: logs and never throws. */
export async function destroyAsset(publicId: string): Promise<void> {
  const config = getStorageConfig();
  if (!config) return;

  if (config.provider === "local") {
    await removeLocalFile(publicId);
    return;
  }

  const { cloudName, apiKey, apiSecret } = config;
  if (!cloudName || !apiKey || !apiSecret) return;

  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp, invalidate: true };

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params,
          api_key: apiKey,
          signature: signParams(params, apiSecret),
        }),
      }
    );
    if (!response.ok) {
      console.error(
        "[storage] destroy failed",
        publicId,
        response.status
      );
    }
  } catch (error) {
    console.error(
      "[storage] destroy threw",
      error instanceof Error ? error.message : "unknown"
    );
  }
}

/**
 * Writes one file to `public/uploads/darbar/admin` and answers in the same shape
 * Cloudinary would, so `registerMediaUpload` cannot tell the two providers
 * apart. Called by `POST /api/upload/local`, never by a client directly.
 */
export async function writeLocalUpload(
  input: { data: Uint8Array; mimeType: string; width?: number | null; height?: number | null },
  origin: string
): Promise<CloudinaryUploadResult> {
  const config = assertStorageConfigured();
  if (config.provider !== "local") {
    throw new UploadValidationError("Local uploads are not enabled");
  }

  assertAllowedMimeType(input.mimeType);
  assertWithinSizeLimit(input.data.byteLength);

  // The declared type is written by the browser and decides nothing on its own.
  // The extension below comes from the sniffed type, so a lying `File.type` cannot
  // make a file be stored and served as something it is not.
  const actualType = sniffImageMimeType(input.data);
  if (!actualType || actualType !== input.mimeType) {
    throw new UploadValidationError("The file is not the image type it claims to be");
  }

  const filename = `${randomUUID()}.${MIME_TO_EXTENSION[actualType]}`;
  const publicId = `${MEDIA_UPLOAD_FOLDER}/${filename}`;
  const directory = path.join(process.cwd(), LOCAL_UPLOAD_DIR, MEDIA_UPLOAD_FOLDER);

  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), input.data);

  return {
    public_id: publicId,
    secure_url: new URL(
      `${LOCAL_UPLOAD_URL_PREFIX}/${publicId}`,
      origin
    ).toString(),
    bytes: input.data.byteLength,
    width: positiveInt(input.width),
    height: positiveInt(input.height),
    format: formatForCloudinary(input.mimeType),
    resource_type: "image",
  };
}

async function removeLocalFile(publicId: string): Promise<void> {
  const root = path.join(process.cwd(), LOCAL_UPLOAD_DIR);
  const target = path.resolve(root, publicId);
  // Never let a crafted public id escape the uploads directory.
  if (target !== root && !target.startsWith(root + path.sep)) return;
  try {
    await unlink(target);
  } catch {
    // Already gone, or never written: nothing to clean up.
  }
}

function positiveInt(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

/** Origin local uploads must come from, when the site URL is known. */
function siteOrigin(): string | null {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) return null;
  try {
    return new URL(siteUrl).origin;
  } catch {
    return null;
  }
}

/** Reduces an absolute URL to its origin; ignores anything unparseable. */
function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}