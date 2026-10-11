import { NextResponse } from "next/server";
import { isRedirectError, requirePermission } from "@/server/session";
import {
  isLocalStorageEnabled,
  StorageNotConfiguredError,
  UploadValidationError,
  writeLocalUpload,
} from "@/server/services/storage";

export const runtime = "nodejs";

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

  try {
    await requirePermission("media.upload");

    // Measured in the browser and used for layout only; the server re-checks
    // the byte size and the MIME allow-list itself.
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
      return NextResponse.json({ error: error.message }, { status: 503 });
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