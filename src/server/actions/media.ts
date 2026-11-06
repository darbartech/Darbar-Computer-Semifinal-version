"use server";
import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { isRedirectError, requirePermission } from "@/server/session";
import { audit, type AuditActor } from "@/server/services/audit";
import {
  confirmAssetOnProvider,
  destroyAsset,
  getStorageConfig,
  verifyUploadedAsset,
  type CloudinaryUploadResult,
} from "@/server/services/storage";
import {
  createExternalMedia,
  createMedia,
  deleteMediaRow,
  getMediaUsage,
  updateMediaAlt,
} from "@/server/dal/media";
import {
  deleteMediaSchema,
  externalMediaSchema,
  registerMediaSchema,
  updateMediaAltSchema,
} from "@/lib/validators/media";

export type MediaActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const NO_PERMISSION = "You don't have permission to do that";

function isForbidden(error: unknown): boolean {
  return error instanceof Error && error.message.includes("FORBIDDEN");
}

/**
 * Origin this request arrived on. Local uploads echo it back, and in
 * development the admin is often on the LAN address rather than localhost, so
 * verification has to accept both this and the configured site origin.
 *
 * `host` names the address the client actually requested. `x-forwarded-host` is
 * only honoured when it is a loopback or private address — that is the LAN
 * development case it exists for. Otherwise a caller could forge it and make us
 * store a Media row whose URL points at a server we do not control.
 */
async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host") ?? privateHost(firstValue(h.get("x-forwarded-host")));
  if (!host) return null;
  const proto =
    firstValue(h.get("x-forwarded-proto")) ??
    (/^(localhost|127\.|\[::1\])/i.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[::1\]|::1|\[[0-9a-f]*:(?:[0-9a-f]*:)?[0-9a-f]*\])/i;

function privateHost(host: string | null): string | null {
  if (!host) return null;
  return PRIVATE_HOST.test(host.replace(/^[a-z]+:\/\//i, "")) ? host : null;
}

function firstValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * Registers a freshly uploaded asset in the media library.
 *
 * The browser uploads the file straight to Cloudinary using the signature from
 * `/api/upload/sign`; it then relays Cloudinary's response here. That response
 * is untrusted, so `verifyUploadedAsset` re-checks the folder, delivery host,
 * MIME type and byte size on the server, and `confirmAssetOnProvider` then
 * re-reads the asset from Cloudinary's Admin API so the stored size and type are
 * the provider's own numbers rather than reported ones. On failure the asset is
 * destroyed so an untracked file cannot linger in the bucket.
 *
 * Alt text is mandatory (docs/08 §1).
 */
export async function registerMediaUpload(
  input: unknown
): Promise<MediaActionResult<{ id: string; url: string; alt: string }>> {
  let actor: AuditActor | null = null;

  try {
    const user = await requirePermission("media.upload");
    actor = { id: user.id, email: user.email };

    const parsed = registerMediaSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please fix the highlighted fields",
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
      };
    }
    const data = parsed.data;

    const config = getStorageConfig();
    if (!config) {
      return { ok: false, error: "Uploads are not configured on this server" };
    }

    let verified;
    try {
      const claimed = verifyUploadedAsset(
        {
          public_id: data.publicId,
          secure_url: data.secureUrl,
          bytes: data.bytes,
          width: data.width,
          height: data.height,
          format: data.format,
          resource_type: data.resourceType,
        } as CloudinaryUploadResult,
        config,
        { requestOrigin: await requestOrigin() }
      );
      // Those were the numbers the browser relayed. Ask the provider what it
      // actually holds and write the row from that answer.
      verified = await confirmAssetOnProvider(claimed, config);
    } catch (error) {
      // Do not leave an unvalidated asset in storage.
      await destroyAsset(data.publicId);
      await audit({
        actor,
        action: "media.upload.rejected",
        entity: "Media",
        entityId: null,
        summary: "Rejected upload that failed server-side verification",
        meta: {
          publicId: data.publicId,
          reason: error instanceof Error ? error.message : "unknown",
        },
      });
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "That file could not be accepted",
      };
    }

    const media = await createMedia({
      url: verified.url,
      publicId: verified.publicId,
      alt: data.alt,
      width: verified.width,
      height: verified.height,
      bytes: verified.bytes,
      mimeType: verified.mimeType,
      folder: verified.folder,
      uploadedById: user.id,
    });

    await audit({
      actor,
      action: "media.upload",
      entity: "Media",
      entityId: media.id,
      summary: `Uploaded image (${verified.mimeType})`,
      meta: {
        publicId: verified.publicId,
        bytes: verified.bytes,
        width: verified.width,
        height: verified.height,
        mimeType: verified.mimeType,
      },
    });

    return { ok: true, data: { id: media.id, url: media.url, alt: media.alt } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error(
      "[registerMediaUpload]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/**
 * Adds an image to the library from a URL instead of a file upload — the second
 * half of the picker, so a course cover, gallery photo or logo that already
 * lives on a CDN or the owner's own host can be used without re-uploading it.
 *
 * The URL is validated (public https, or loopback http for local development)
 * and the alt text is mandatory, same rule as an upload. No file is fetched, so
 * the row records no size or MIME type and deleting it never touches a remote
 * asset.
 */
export async function addMediaByUrl(
  input: unknown
): Promise<MediaActionResult<{ id: string; url: string; alt: string }>> {
  let actor: AuditActor | null = null;

  try {
    const user = await requirePermission("media.upload");
    actor = { id: user.id, email: user.email };

    const parsed = externalMediaSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please fix the highlighted fields",
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
      };
    }

    const media = await createExternalMedia({
      url: parsed.data.url,
      alt: parsed.data.alt,
      folder: parsed.data.folder ?? null,
      uploadedById: user.id,
    });

    await audit({
      actor,
      action: "media.external.create",
      entity: "Media",
      entityId: media.id,
      summary: "Added image from URL",
      meta: { url: media.url },
    });

    return { ok: true, data: media };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error(
      "[addMediaByUrl]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/** Updates the alt text of an existing asset. */
export async function updateMediaAltText(
  input: unknown
): Promise<MediaActionResult<{ id: string; alt: string }>> {
  let actor: AuditActor | null = null;

  try {
    const user = await requirePermission("media.update");
    actor = { id: user.id, email: user.email };

    const parsed = updateMediaAltSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please fix the highlighted fields",
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
      };
    }

    const before = await db.media.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, alt: true },
    });
    if (!before) return { ok: false, error: "Image not found" };

    const updated = await updateMediaAlt(parsed.data.id, parsed.data.alt);

    await audit({
      actor,
      action: "media.update",
      entity: "Media",
      entityId: updated.id,
      summary: "Updated alt text",
      meta: { before: { alt: before.alt }, after: { alt: updated.alt } },
    });

    return { ok: true, data: { id: updated.id, alt: updated.alt } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error(
      "[updateMediaAltText]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}

/**
 * Deletes an asset, but only when nothing references it (docs/05 §4.12).
 * The database row is removed first; the Cloudinary asset is destroyed
 * afterwards and its failure is logged rather than surfaced.
 */
export async function deleteMedia(
  input: unknown
): Promise<MediaActionResult<{ id: string }>> {
  let actor: AuditActor | null = null;

  try {
    const user = await requirePermission("media.delete");
    actor = { id: user.id, email: user.email };

    const parsed = deleteMediaSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please fix the highlighted fields",
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
      };
    }
    const id = parsed.data.id;

    const existing = await db.media.findUnique({
      where: { id },
      select: { id: true, publicId: true, url: true, bytes: true },
    });
    if (!existing) return { ok: false, error: "Image not found" };

    // Re-check usage server-side. The UI hides the button, but Server Actions
    // are public POST endpoints.
    const usage = await getMediaUsage(id);
    if (usage.total > 0) {
      return {
        ok: false,
        error: `This image is used in ${usage.total} place${
          usage.total === 1 ? "" : "s"
        } and cannot be deleted`,
      };
    }

    await deleteMediaRow(id);

    await audit({
      actor,
      action: "media.delete",
      entity: "Media",
      entityId: id,
      summary: "Deleted unused image",
      meta: { publicId: existing.publicId, bytes: existing.bytes },
    });

    if (existing.publicId) await destroyAsset(existing.publicId);

    return { ok: true, data: { id } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (isForbidden(error)) return { ok: false, error: NO_PERMISSION };
    console.error(
      "[deleteMedia]",
      error instanceof Error ? error.message : "unknown"
    );
    return { ok: false, error: GENERIC_FAILURE };
  }
}
