import { NextResponse } from "next/server";
import { isRedirectError, requirePermission } from "@/server/session";
import {
  isLocalStorageEnabled,
  StorageNotConfiguredError,
  UploadValidationError,
  writeLocalUpload,
} from "@/server/services/storage";
import { allowByIp, getClientIpHash } from "@/server/services/rate-limit";
import { MEDIA_MAX_BYTES } from "@/server/constants";

export const runtime = "nodejs";

/** A signed-in staff member uploading a batch, not a flood. */
const UPLOAD_RATE_LIMIT = { max: 100, windowMinutes: 10 } as const;

/**
 * POST /api/upload/local
 *
 * The local-storage counterpart of `POST /api/upload/sign` + a direct browser
 * upload to Cloudinary. Used automatically while no Cloudinary credentials are
 * configured, so the media library, cover images and avatars all work during
 * development (see `src/server/services/storage.ts`).
 *
 * The response is deliberately Cloudinary-shaped: the browser relays it to
 * `registerMediaUpload`, which re-verifies folder, URL, MIME type and size
 * before a `Media` row is written — so this route never writes a trusted row by
 * itself.
 */
export async function POST(request: Request) {
  if (!isLocalStorageEnabled()) {
    return NextResponse.json(
      { error: "Local uploads are not enabled on this server" },
      { status: 404 }
    );
  }

  try {
    // Guard and throttle before the body is touched: `formData()` buffers the whole
    // upload, so an unauthenticated caller must never reach it.
    await requirePermission("media.upload");
    // Only a signed-in staff member gets here, so the counter is about the
    // connection, not the person: an admin working from the campus network
    // publishes a gallery without spending the building's budget (reaudit N2).
    if (
      !(await allowByIp(`upload:${await getClientIpHash()}`, UPLOAD_RATE_LIMIT))
    ) {
      return NextResponse.json(
        { error: "Too many uploads. Please try again later." },
        { status: 429 }
      );
    }

    // The body limit that protects Server Actions does not apply to route handlers,
    // so reject an oversized request on its declared length before reading it.
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MEDIA_MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large" }, { status: 413 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid upload body" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
    }

    // Measured in the browser and used for layout only; the server re-checks
    // the byte size, the MIME allow-list and the file's magic numbers.
    const width = Number(formData.get("width"));
    const height = Number(formData.get("height"));

    const uploaded = await writeLocalUpload(
      {
        data: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type,
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null,
      },
      new URL(request.url).origin
    );

    return NextResponse.json(uploaded, { status: 200 });
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      // The message names the environment variables it wants; keep that in the log.
      console.error("[upload/local]", error.message);
      return NextResponse.json(
        { error: "Uploads are not configured on this server." },
        { status: 503 }
      );
    }
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("FORBIDDEN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (isRedirectError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error(
      "[upload/local]",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "The upload could not be saved. Please try again." },
      { status: 500 }
    );
  }
}