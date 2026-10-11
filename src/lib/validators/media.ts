import { z } from "zod";

/**
 * Alt text is required on every image (docs/08 §1 "Alt text required on every
 * image"; docs/05 §4.9 makes it required per gallery image). The schema is
 * shared by the client form and the Server Action, so the rule cannot be
 * bypassed by posting straight at the action endpoint.
 */
export const mediaAltSchema = z
  .string()
  .trim()
  .min(1, "Alt text is required")
  .max(200, "Alt text must be 200 characters or fewer");

const cuidLike = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid id");

/** Request body for POST /api/upload/sign. */
export const signUploadSchema = z.object({
  mimeType: z.string().trim().min(1, "File type is required").max(100),
  sizeBytes: z.coerce.number().int().positive(),
});

/** Body of the Cloudinary upload response, relayed by the browser. */
export const cloudinaryResultSchema = z.object({
  public_id: z.string().trim().min(1).max(255),
  secure_url: z.string().url().max(2048),
  bytes: z.coerce.number().int().positive(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  format: z.string().trim().min(1).max(20),
  resource_type: z.string().trim().min(1).max(20).optional(),
});

/** Server Action input: register a freshly uploaded asset. */
export const registerMediaSchema = z.object({
  publicId: z.string().trim().min(1).max(255),
  secureUrl: z.string().url().max(2048),
  bytes: z.coerce.number().int().positive(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  format: z.string().trim().min(1).max(20),
  resourceType: z.string().trim().min(1).max(20).optional(),
  alt: mediaAltSchema,
  folder: z.string().trim().min(1).max(255).optional(),
});

/** Server Action input: edit alt text on an existing asset. */
export const updateMediaAltSchema = z.object({
  id: cuidLike,
  alt: mediaAltSchema,
});

/** Server Action input: delete an asset. */
export const deleteMediaSchema = z.object({
  id: cuidLike,
});

/**
 * Public images must be https so the public site never mixes insecure content
 * or points at a host that could resolve to a private address. Loopback http is
 * allowed because local development serves uploads from http://localhost:3000.
 */
const PRIVATE_HOST =
  /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.0\.0\.0$|\[?::1\]?$|\[?f[cd])/i;

function isAllowedImageUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return !PRIVATE_HOST.test(parsed.hostname);
  if (parsed.protocol !== "http:") return false;
  return /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
}

/**
 * Server Action input: add an image that already lives somewhere else by URL,
 * instead of uploading a file. Used by the "From URL" option in every
 * `ImagePicker`.
 */
export const externalMediaSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "URL is required")
    .max(2048, "URL must be 2048 characters or fewer")
    .refine(
      isAllowedImageUrl,
      "Use a public https:// URL, or your own http://localhost address"
    ),
  alt: mediaAltSchema,
  folder: z.string().trim().min(1).max(255).optional(),
});

export type SignUploadInput = z.infer<typeof signUploadSchema>;
export type RegisterMediaInput = z.infer<typeof registerMediaSchema>;
export type UpdateMediaAltInput = z.infer<typeof updateMediaAltSchema>;
export type DeleteMediaInput = z.infer<typeof deleteMediaSchema>;
export type ExternalMediaInput = z.infer<typeof externalMediaSchema>;